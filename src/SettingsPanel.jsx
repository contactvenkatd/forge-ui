import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, LogOut, Trash2, X } from 'lucide-react'
import Avatar from './Avatar'
import { EXPORT_FORMATS, FINISHES, MATERIALS } from './settings'

function Section({ index, title, children }) {
  return (
    <section className="border-t border-white/[0.08] px-6 py-7 first:border-t-0">
      <p className="eyebrow"><span>{index}</span> {title}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

function FieldLabel({ children, htmlFor }) {
  return <label className="block text-sm font-medium text-zinc-300" htmlFor={htmlFor}>{children}</label>
}

// Read-only key/value row used throughout the profile block.
function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-white/[0.055] py-2.5 first:border-t-0 first:pt-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</span>
      <span className="min-w-0 truncate text-sm text-zinc-300">{value}</span>
    </div>
  )
}

function Segmented({ value, options, onChange, name }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={name}>
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex items-center justify-center gap-2 border px-3 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.11em] transition-colors ${
              active
                ? 'border-amber-400/60 bg-amber-400/[0.09] text-amber-300'
                : 'border-white/[0.12] bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-zinc-300'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function Select({ id, value, options, onChange }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="field cursor-pointer appearance-none py-3">
      {options.map((option) => (
        <option key={option} value={option} className="bg-[#101214] text-zinc-200">{option}</option>
      ))}
    </select>
  )
}

function formatMemberSince(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function SignedOutNote({ children }) {
  return <p className="border border-white/[0.08] bg-white/[0.015] px-4 py-3 text-sm leading-6 text-zinc-500">{children}</p>
}

export default function SettingsPanel({ open, onClose, settings, onChange, user, onSignOut, onDeleteAccount }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (open) panelRef.current?.focus()
    // Never leave the panel armed for deletion across open/close cycles.
    else { setConfirmingDelete(false); setDeleteError('') }
  }, [open])

  const set = (key) => (value) => onChange({ ...settings, [key]: value })

  const runDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    const { error } = (await onDeleteAccount()) ?? {}
    setDeleting(false)
    if (error) {
      setDeleteError(error)
      return
    }
    setConfirmingDelete(false)
    onClose()
  }

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '—'
  const memberSince = formatMemberSince(user?.created_at)

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        aria-hidden={!open}
        className={`settings-panel fixed right-0 top-0 z-50 flex h-full w-[400px] max-w-full flex-col border-l border-white/[0.12] bg-[#0c0e10] shadow-[-24px_0_60px_rgba(0,0,0,.55)] transition-transform duration-300 ease-out focus:outline-none ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.02em] text-white">Account settings</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Forge workspace</p>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="grid h-7 w-7 shrink-0 place-items-center border border-white/[0.12] text-zinc-500 transition-colors hover:border-amber-400/35 hover:text-amber-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section index="01" title="Profile">
            {user ? (
              <>
                <div className="flex items-center gap-4">
                  <Avatar user={user} size="h-14 w-14" iconSize="h-6 w-6" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-white">{displayName}</p>
                    <p className="mt-0.5 truncate text-sm text-zinc-500">{user.email}</p>
                  </div>
                </div>
                <div className="border border-white/[0.08] bg-white/[0.015] px-4 py-3">
                  <ReadOnlyRow label="Display name" value={displayName} />
                  <ReadOnlyRow label="Email" value={user.email || '—'} />
                  <ReadOnlyRow label="Member since" value={memberSince || 'Unknown'} />
                </div>
              </>
            ) : (
              <SignedOutNote>Sign in to view your profile.</SignedOutNote>
            )}
          </Section>

          <Section index="02" title="Appearance">
            <div>
              <FieldLabel>Theme</FieldLabel>
              <div className="mt-2">
                <Segmented name="Theme" value={settings.theme} onChange={set('theme')} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
              </div>
            </div>
            <div>
              <FieldLabel>Units</FieldLabel>
              <div className="mt-2">
                <Segmented name="Units" value={settings.units} onChange={set('units')} options={[{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }]} />
              </div>
            </div>
          </Section>

          <Section index="03" title="Design defaults">
            <div>
              <FieldLabel htmlFor="default-material">Default material</FieldLabel>
              <div className="mt-2"><Select id="default-material" value={settings.material} options={MATERIALS} onChange={set('material')} /></div>
            </div>
            <div>
              <FieldLabel htmlFor="default-load">Default load capacity ({settings.units === 'imperial' ? 'lb' : 'kg'})</FieldLabel>
              <input
                id="default-load"
                type="number"
                min="0"
                step="1"
                value={settings.loadCapacity}
                onChange={(event) => set('loadCapacity')(event.target.value === '' ? '' : Number(event.target.value))}
                className="field mt-2 py-3 font-mono text-sm"
              />
            </div>
            <div>
              <FieldLabel htmlFor="default-finish">Default finish</FieldLabel>
              <div className="mt-2"><Select id="default-finish" value={settings.finish} options={FINISHES} onChange={set('finish')} /></div>
            </div>
          </Section>

          <Section index="04" title="Export preferences">
            <fieldset>
              <legend className="text-sm font-medium text-zinc-300">Preferred export format</legend>
              <div className="mt-3 space-y-1.5">
                {EXPORT_FORMATS.map((format) => (
                  <label
                    key={format}
                    className={`flex cursor-pointer items-center gap-3 border px-4 py-3 transition-colors ${
                      settings.exportFormat === format ? 'border-amber-400/45 bg-amber-400/[0.06]' : 'border-white/[0.08] bg-white/[0.015] hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={format}
                      checked={settings.exportFormat === format}
                      onChange={() => set('exportFormat')(format)}
                      className="h-3.5 w-3.5 accent-amber-400"
                    />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{format}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section index="05" title="Account">
            {user ? (
              <>
                <button onClick={onSignOut} className="secondary-button"><LogOut className="h-3.5 w-3.5" /> Sign out</button>

                <div className="border border-red-500/25 bg-red-500/[0.04] px-4 py-4">
                  <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-red-400/90">
                    <AlertTriangle className="h-3.5 w-3.5" /> Danger zone
                  </p>

                  {confirmingDelete ? (
                    <>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">
                        This permanently deletes your account and every saved project. It cannot be undone.
                      </p>
                      <div className="mt-4 flex gap-2">
                        <button onClick={runDelete} disabled={deleting} className="danger-button flex-1">
                          <Trash2 className="h-3.5 w-3.5" /> {deleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button onClick={() => { setConfirmingDelete(false); setDeleteError('') }} disabled={deleting} className="secondary-button flex-1 justify-center">
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-sm leading-6 text-zinc-500">Permanently delete your account and all saved projects.</p>
                      <button onClick={() => setConfirmingDelete(true)} className="danger-button mt-3">
                        <Trash2 className="h-3.5 w-3.5" /> Delete account
                      </button>
                    </>
                  )}

                  {deleteError && <p className="mt-3 text-xs leading-5 text-red-300/90">{deleteError}</p>}
                </div>
              </>
            ) : (
              <SignedOutNote>Sign in to manage your account.</SignedOutNote>
            )}
          </Section>
        </div>
      </aside>
    </>
  )
}
