"use client";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button.js";
import { Input } from "@/components/ui/Input.js";
import { Select } from "@/components/ui/Select.js";
import { SizeGuideTable } from "@/components/ui/SizeGuideTable.js";
import { SizeGuideEditor, normalizeSizeGuide } from "@/components/ui/SizeGuideEditor.js";
import { useModalScrollLock } from "@/hooks/useModalScrollLock.js";
import { useConfirm } from "@/hooks/useConfirm.js";

// The product form's size guide, with saved guides (presets) the vendor
// types once and reuses. Three states:
//   - none:   pick a saved guide, or start a new one
//   - linked: uses a saved guide - shown read-only; editing the saved guide
//             updates every product using it; "customise" makes a copy
//             just for this product
//   - own:    this product's own table (the editor), with "Save for reuse"
//
// value = { sizeGuide, sizeGuidePresetId }; onChange gets the next value.
// The server copies a linked preset's table into the product (see
// lib/sizeGuidePresets.js), so what's sent for a linked product's table
// doesn't matter.
export function SizeGuideField({ storeId, apiFetch, value, onChange }) {
  const { sizeGuide, sizeGuidePresetId } = value;
  const [presets, setPresets] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [managing, setManaging] = useState(false);

  const loadPresets = useCallback(() => {
    if (!storeId) return;
    apiFetch(`/api/v1/vendor/stores/${storeId}/size-guides`)
      .then((data) => setPresets(data.presets || []))
      .catch(() => setPresets([]));
  }, [apiFetch, storeId]);

  useEffect(() => {
    const timer = setTimeout(loadPresets, 0);
    return () => clearTimeout(timer);
  }, [loadPresets]);

  const linked = sizeGuidePresetId ? (presets || []).find((p) => p.id === sizeGuidePresetId) : null;
  const usePreset = (presetId) => {
    const preset = (presets || []).find((p) => p.id === presetId);
    if (preset) onChange({ sizeGuide: preset.guide, sizeGuidePresetId: preset.id });
  };
  const options = (presets || []).map((p) => ({ value: p.id, label: p.name }));

  // Linked to a saved guide.
  if (sizeGuidePresetId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-slate-700">Size guide</label>
          <button type="button" onClick={() => onChange({ sizeGuide: null, sizeGuidePresetId: null })} className="text-xs text-slate-800 hover:text-red-600 cursor-pointer">Remove</button>
        </div>
        <div className="rounded-sm border border-brand-200 bg-brand-50/50 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-800">
              <Bookmark size={14} className="inline -mt-0.5 mr-1 text-brand-700" />
              Using saved guide <strong>{linked?.name || "…"}</strong>
            </p>
            {options.length > 1 && (
              <div className="w-48"><Select value={sizeGuidePresetId} onChange={usePreset} options={options} aria-label="Change saved size guide" /></div>
            )}
          </div>
          {sizeGuide && <SizeGuideTable guide={sizeGuide} />}
          <div className="flex flex-wrap gap-2">
            {linked && (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingPreset(linked)}>
                <Pencil size={14} /> Edit saved guide
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ sizeGuide: structuredClone(sizeGuide), sizeGuidePresetId: null })}>
              Change for this product only
            </Button>
          </div>
          {linked && linked.productCount > 1 && (
            <p className="text-xs text-slate-600">Used on {linked.productCount} products - editing the saved guide updates all of them.</p>
          )}
        </div>
        {editingPreset && (
          <PresetEditorModal
            storeId={storeId}
            apiFetch={apiFetch}
            preset={editingPreset}
            onClose={() => setEditingPreset(null)}
            onSaved={(saved) => {
              setEditingPreset(null);
              loadPresets();
              onChange({ sizeGuide: saved.guide, sizeGuidePresetId: saved.id });
            }}
          />
        )}
      </div>
    );
  }

  // No guide yet.
  if (!sizeGuide) {
    return (
      <div>
        <label className="text-sm font-medium text-slate-700">Size guide</label>
        <p className="text-xs text-slate-800 mt-0.5 mb-2">A measurements table shoppers open from the product page.</p>
        <div className="flex flex-wrap items-center gap-2">
          {options.length > 0 && (
            <div className="w-full sm:w-64">
              <Select value="" onChange={usePreset} options={options} placeholder="Use a saved size guide" aria-label="Use a saved size guide" />
            </div>
          )}
          <SizeGuideEditor value={null} onChange={(guide) => onChange({ sizeGuide: guide, sizeGuidePresetId: null })} addOnly />
          {options.length > 0 && (
            <button type="button" onClick={() => setManaging(true)} className="text-xs font-medium text-slate-700 underline hover:text-slate-900 cursor-pointer">
              Manage saved guides
            </button>
          )}
        </div>
        {managing && <ManagePresetsModal storeId={storeId} apiFetch={apiFetch} presets={presets || []} onChanged={loadPresets} onClose={() => setManaging(false)} />}
      </div>
    );
  }

  // This product's own table.
  return (
    <div className="space-y-2">
      <SizeGuideEditor value={sizeGuide} onChange={(guide) => onChange({ sizeGuide: guide, sizeGuidePresetId: null })} />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setSaveOpen(true)}>
          <Bookmark size={14} /> Save for other products
        </Button>
        {options.length > 0 && (
          <div className="w-full sm:w-64">
            <Select value="" onChange={usePreset} options={options} placeholder="Or use a saved size guide" aria-label="Use a saved size guide instead" />
          </div>
        )}
      </div>
      {saveOpen && (
        <SavePresetModal
          storeId={storeId}
          apiFetch={apiFetch}
          guide={sizeGuide}
          onClose={() => setSaveOpen(false)}
          onSaved={(preset) => {
            setSaveOpen(false);
            loadPresets();
            onChange({ sizeGuide: preset.guide, sizeGuidePresetId: preset.id });
            toast.success(`Saved as "${preset.name}". Pick it on any product.`);
          }}
        />
      )}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, busy, children, footer }) {
  useModalScrollLock(true);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center overscroll-none sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" className="relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-sm bg-surface shadow-xl sm:max-w-2xl sm:rounded-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="shrink-0 rounded-sm p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 cursor-pointer"><X size={20} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">{children}</div>
        {footer && <div className="border-t border-slate-200 p-4 sm:p-5">{footer}</div>}
      </div>
    </div>
  );
}

function SavePresetModal({ storeId, apiFetch, guide, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const clean = normalizeSizeGuide(guide);
    if (!clean) return toast.error("Fill in at least one size and measurement first");
    if (!name.trim()) return toast.error("Give the size guide a name");
    setSaving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/size-guides`, { method: "POST", body: JSON.stringify({ name: name.trim(), guide: clean }) });
      onSaved(data.preset);
    } catch (err) {
      toast.error(err.message || "Could not save the size guide");
      setSaving(false);
    }
  };
  return (
    <ModalShell
      title="Save size guide"
      subtitle="Name it so you can pick it on other products."
      onClose={onClose}
      busy={saving}
      footer={<div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></div>}
    >
      <Input label="Name" placeholder="e.g. Women's dresses, Men's shoes" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
    </ModalShell>
  );
}

function PresetEditorModal({ storeId, apiFetch, preset, onClose, onSaved }) {
  const [name, setName] = useState(preset.name);
  const [guide, setGuide] = useState(() => structuredClone(preset.guide));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const clean = normalizeSizeGuide(guide);
    if (!clean) return toast.error("Fill in at least one size and measurement");
    if (!name.trim()) return toast.error("Give the size guide a name");
    setSaving(true);
    try {
      const data = await apiFetch(`/api/v1/vendor/stores/${storeId}/size-guides/${preset.id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), guide: clean }) });
      toast.success(data.productsUpdated > 0 ? `Saved. Updated on ${data.productsUpdated} product${data.productsUpdated === 1 ? "" : "s"}.` : "Saved.");
      onSaved(data.preset);
    } catch (err) {
      toast.error(err.message || "Could not save the size guide");
      setSaving(false);
    }
  };
  return (
    <ModalShell
      title="Edit saved size guide"
      subtitle={preset.productCount > 0 ? `Changes show on all ${preset.productCount} product${preset.productCount === 1 ? "" : "s"} using it.` : undefined}
      onClose={onClose}
      busy={saving}
      footer={<div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></div>}
    >
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <SizeGuideEditor value={guide} onChange={(next) => next && setGuide(next)} hideRemove />
    </ModalShell>
  );
}

function ManagePresetsModal({ storeId, apiFetch, presets, onChanged, onClose }) {
  const [editing, setEditing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { confirm, confirmDialog } = useConfirm();
  const remove = async (preset) => {
    const ok = await confirm({
      title: `Delete "${preset.name}"?`,
      description: preset.productCount > 0 ? `The ${preset.productCount} product${preset.productCount === 1 ? "" : "s"} using it keep their size guide.` : undefined,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingId(preset.id);
    try {
      await apiFetch(`/api/v1/vendor/stores/${storeId}/size-guides/${preset.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      toast.error(err.message || "Could not delete the size guide");
    } finally {
      setDeletingId(null);
    }
  };
  return (
    <ModalShell title="Saved size guides" onClose={onClose}>
      {confirmDialog}
      {presets.length === 0 ? (
        <p className="text-sm text-slate-600">No saved size guides yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-sm border border-slate-200">
          {presets.map((preset) => (
            <li key={preset.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{preset.name}</p>
                <p className="text-xs text-slate-600">Used on {preset.productCount} product{preset.productCount === 1 ? "" : "s"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setEditing(preset)}><Pencil size={14} /> Edit</Button>
                <button type="button" onClick={() => remove(preset)} disabled={deletingId === preset.id} aria-label={`Delete ${preset.name}`} className="p-2 text-slate-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"><Trash2 size={15} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <PresetEditorModal
          storeId={storeId}
          apiFetch={apiFetch}
          preset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </ModalShell>
  );
}

