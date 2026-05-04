import "./LabeledCheckbox.css";

type LabeledCheckboxProps = {
  checked: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
};

export function LabeledCheckbox({ checked, label, name, onChange }: LabeledCheckboxProps) {
  return (
    <label className="labeled-checkbox">
      <span>{label}</span>
      <input
        checked={checked}
        className="labeled-checkbox__input"
        name={name}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
