import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  getProfilePermissions,
  type PermissionAction,
  type PermissionEffect,
  type PermissionRule,
  updateProfilePermissions
} from '@/hermes'
import { useI18n } from '@/i18n'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Plus,
  Save,
  ShieldLock,
  Trash2
} from '@/lib/icons'
import { notify } from '@/store/notifications'

import { PanelSectionLabel } from '../overlays/panel'

const ACTION_OPTIONS: Array<{ label: string; value: PermissionAction }> = [
  { label: '* (All Actions)', value: '*' },
  { label: 'read (Files & Inspection)', value: 'read' },
  { label: 'edit (Write & Patch)', value: 'edit' },
  { label: 'shell (Terminal & Code)', value: 'shell' },
  { label: 'subagent (Delegation)', value: 'subagent' },
  { label: 'web (Search & Network)', value: 'web' }
]

const EFFECT_OPTIONS: Array<{ label: string; value: PermissionEffect }> = [
  { label: 'allow', value: 'allow' },
  { label: 'ask (Prompt Human)', value: 'ask' },
  { label: 'deny (Block)', value: 'deny' }
]

interface PermissionsEditorProps {
  profileName: string
}

export function PermissionsEditor({ profileName }: PermissionsEditorProps) {
  const { t } = useI18n()
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [original, setOriginal] = useState<PermissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const requestRef = useRef<string>(profileName)

  useEffect(() => {
    requestRef.current = profileName
    setLoading(true)
    setError(null)
    setRules([])
    setOriginal([])

    void (async () => {
      try {
        const resp = await getProfilePermissions(profileName)
        if (requestRef.current === profileName) {
          const loadedRules = resp.permissions || []
          setRules(loadedRules)
          setOriginal(loadedRules)
        }
      } catch (err) {
        if (requestRef.current === profileName) {
          setError(err instanceof Error ? err.message : 'Failed to load profile permissions')
        }
      } finally {
        if (requestRef.current === profileName) {
          setLoading(false)
        }
      }
    })()
  }, [profileName])

  const dirty = JSON.stringify(rules) !== JSON.stringify(original)

  async function handleSave() {
    setSaving(true)
    setError(null)

    try {
      await updateProfilePermissions(profileName, rules)
      setOriginal(rules)
      notify({
        kind: 'success',
        title: 'Permissions updated',
        message: `${profileName} (${rules.length} rules)`
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save permissions')
    } finally {
      setSaving(false)
    }
  }

  function updateRule(index: number, patch: Partial<PermissionRule>) {
    setRules(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRule() {
    setRules(prev => [...prev, { action: '*', resource: '*', effect: 'allow' }])
  }

  function removeRule(index: number) {
    setRules(prev => prev.filter((_, i) => i !== index))
  }

  function moveRule(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= rules.length) return
    setRules(prev => {
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  function applyPreset(preset: 'protect_secrets' | 'confirm_dangerous' | 'readonly') {
    if (preset === 'protect_secrets') {
      setRules(prev => [
        ...prev,
        { action: 'read', resource: '**/.env*', effect: 'deny' },
        { action: 'edit', resource: '**/.env*', effect: 'deny' }
      ])
    } else if (preset === 'confirm_dangerous') {
      setRules(prev => [
        ...prev,
        { action: 'shell', resource: 'git push*', effect: 'ask' },
        { action: 'shell', resource: 'rm -rf*', effect: 'ask' }
      ])
    } else if (preset === 'readonly') {
      setRules(prev => [
        ...prev,
        { action: 'edit', resource: '*', effect: 'deny' },
        { action: 'shell', resource: '*', effect: 'ask' }
      ])
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <ShieldLock className="size-3.5 text-muted-foreground" />
            <PanelSectionLabel className="text-[0.7rem] tracking-[0.14em]">
              ACCESS CONTROL & PERMISSIONS
            </PanelSectionLabel>
          </div>
          <p className="text-xs text-muted-foreground">
            Sequential rule matrix. Evaluated top-to-bottom: <strong>last matching rule determines effect</strong>.
          </p>
        </div>
        {dirty && <span className="text-[0.65rem] text-muted-foreground">Unsaved policy changes</span>}
      </div>

      {/* Quick Presets Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/40 bg-muted/20 p-2">
        <span className="text-[0.68rem] font-medium text-muted-foreground mr-1">Add Preset:</span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[0.68rem] px-2"
          onClick={() => applyPreset('protect_secrets')}
        >
          🔒 Protect .env Secrets
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[0.68rem] px-2"
          onClick={() => applyPreset('confirm_dangerous')}
        >
          ⚠️ Confirm Dangerous Shell
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[0.68rem] px-2"
          onClick={() => applyPreset('readonly')}
        >
          📐 Read-Only Plan Mode
        </Button>
      </div>

      {loading ? (
        <PageLoader className="min-h-44" label="Loading permissions policy..." />
      ) : (
        <div className="space-y-2">
          {rules.length === 0 ? (
            <div className="rounded border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
              No custom permissions defined for this profile. (Default: full workspace access)
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card p-2 text-xs shadow-sm transition-colors hover:border-border"
                >
                  <span className="w-5 font-mono text-[0.65rem] text-muted-foreground/60 text-right">
                    #{idx + 1}
                  </span>

                  {/* Action Selector */}
                  <div className="w-40 shrink-0">
                    <select
                      className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      value={rule.action}
                      onChange={e => updateRule(idx, { action: e.target.value as PermissionAction })}
                    >
                      {ACTION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Resource Matcher Input */}
                  <div className="min-w-48 flex-1">
                    <Input
                      className="h-7 text-xs font-mono"
                      placeholder="Resource glob (e.g. src/**, git push*, reviewer)"
                      value={rule.resource}
                      onChange={e => updateRule(idx, { resource: e.target.value })}
                    />
                  </div>

                  {/* Effect Selector */}
                  <div className="w-32 shrink-0">
                    <select
                      className={`w-full rounded border px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 ${
                        rule.effect === 'allow'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : rule.effect === 'ask'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                      value={rule.effect}
                      onChange={e => updateRule(idx, { effect: e.target.value as PermissionEffect })}
                    >
                      {EFFECT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reorder and Delete controls */}
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      disabled={idx === 0}
                      onClick={() => moveRule(idx, 'up')}
                      title="Move Up"
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      disabled={idx === rules.length - 1}
                      onClick={() => moveRule(idx, 'down')}
                      title="Move Down"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRule(idx)}
                      title="Delete Rule"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button size="sm" variant="outline" onClick={addRule}>
              <Plus className="mr-1 size-3.5" />
              Add Rule
            </Button>

            <Button disabled={!dirty || saving || loading} onClick={() => void handleSave()} size="sm">
              <Save className="mr-1 size-3.5" />
              {saving ? 'Saving...' : 'Save Permissions'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </section>
  )
}
