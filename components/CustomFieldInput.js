import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";

// Renders one of an event's custom registration questions (text/textarea/
// select), used both at checkout (buyer's own ticket) and on the claim
// page (gifted tickets, each recipient answers for themselves).
export function CustomFieldInput({ field, value, onChange }) {
  const label = field.required ? `${field.label} *` : field.label;

  if (field.type === "textarea") {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <textarea
          className="w-full px-3 py-2 border border-slate-300 rounded-sm text-base outline-none focus:border-brand-500"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <Select
        label={label}
        placeholder="Select an option"
        options={field.options.map((o) => ({ value: o, label: o }))}
        value={value}
        onChange={onChange}
        required={field.required}
      />
    );
  }

  return <Input label={label} value={value} onChange={(e) => onChange(e.target.value)} required={field.required} />;
}
