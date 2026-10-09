import sys
import tempfile
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock

if "ruamel" not in sys.modules:
    ruamel = ModuleType("ruamel")
    ruamel_yaml = ModuleType("ruamel.yaml")
    ruamel_yaml_error = ModuleType("ruamel.yaml.error")
    ruamel_yaml_resolver = ModuleType("ruamel.yaml.resolver")
    class YAMLError(Exception): pass
    class VersionedResolver: pass
    class YAML:
        def __init__(self, *args, **kwargs): pass
        def load(self, doc):
            import yaml
            return yaml.safe_load(doc)
        def dump(self, data, stream):
            import yaml
            return yaml.safe_dump(data, stream)
    ruamel_yaml.YAML = YAML
    ruamel_yaml_error.YAMLError = YAMLError
    ruamel_yaml_resolver.VersionedResolver = VersionedResolver
    ruamel.yaml = ruamel_yaml
    sys.modules["ruamel"] = ruamel
    sys.modules["ruamel.yaml"] = ruamel_yaml
    sys.modules["ruamel.yaml.error"] = ruamel_yaml_error
    sys.modules["ruamel.yaml.resolver"] = ruamel_yaml_resolver

for mod in ("litellm", "fastapi"):
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

from agent.permissions import PermissionRule, save_profile_permissions


def test_permission_guard_integration():
    from model_tools import _pre_dispatch_guards, _CallIds

    with tempfile.TemporaryDirectory() as td:
        p_dir = Path(td)
        # Deny all shell commands, and deny edit to *.env*
        rules = [
            PermissionRule(action="shell", resource="*", effect="deny"),
            PermissionRule(action="edit", resource="*", effect="allow"),
            PermissionRule(action="edit", resource="*.env*", effect="deny"),
        ]
        save_profile_permissions(p_dir, rules)

        import hermes_constants
        orig_get_home = hermes_constants.get_hermes_home
        hermes_constants.get_hermes_home = lambda: p_dir

        try:
            ids = _CallIds("task-1", "sess-1", "call-1", "turn-1", "req-1")

            # 1. Test shell command blocked
            args, blocked = _pre_dispatch_guards("run_command", {"CommandLine": "rm -rf /"}, False, ids, [])
            assert blocked is not None, "Shell command should have been blocked"
            res, err_type, err_msg = blocked
            assert err_type == "permission_denied"
            assert "blocked by profile policy" in err_msg

            # 2. Test editing .env blocked
            args, blocked = _pre_dispatch_guards("write_to_file", {"TargetFile": ".env"}, False, ids, [])
            assert blocked is not None, "Editing .env should have been blocked"
            res, err_type, err_msg = blocked
            assert err_type == "permission_denied"

            # 3. Test editing normal file allowed
            args, blocked = _pre_dispatch_guards("write_to_file", {"TargetFile": "src/app.py"}, False, ids, [])
            assert blocked is None, "Editing src/app.py should be allowed"

            # 4. Test effect == 'ask' with approval
            from unittest.mock import patch
            ask_rules = [
                PermissionRule(action="subagent", resource="*", effect="ask"),
            ]
            save_profile_permissions(p_dir, ask_rules)

            with patch("tools.approval.request_tool_approval", return_value={"approved": True}):
                args, blocked = _pre_dispatch_guards("delegate_task", {"target_agent": "reviewer"}, False, ids, [])
                assert blocked is None, "Approved ask should proceed without being blocked"

            # 5. Test effect == 'ask' with denial
            with patch("tools.approval.request_tool_approval", return_value={"approved": False, "message": "Rejected by user"}):
                args, blocked = _pre_dispatch_guards("delegate_task", {"target_agent": "reviewer"}, False, ids, [])
                assert blocked is not None, "Denied ask should be blocked"
                res, err_type, err_msg = blocked
                assert err_type == "permission_rejected"
                assert "Rejected by user" in err_msg

        finally:
            hermes_constants.get_hermes_home = orig_get_home


if __name__ == "__main__":
    test_permission_guard_integration()
    print("RUNTIME PERMISSION GUARD TEST PASSED!")
