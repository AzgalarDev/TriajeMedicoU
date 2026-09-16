import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react';
import { Input } from './Input';

type FormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { label: string; hint?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; children?: ReactNode };

export function FormField({ label, hint, children, ...inputProps }: FormFieldProps) {
  return <label htmlFor={inputProps.id ?? inputProps.name} className="grid min-w-0 gap-1.5 text-[13px] font-bold text-[#31516a]">{label}{children ?? <Input {...inputProps} value={inputProps.value ?? ''} id={inputProps.id ?? inputProps.name} />}{hint && <small className="font-normal text-[11px] text-[#7890a1]">{hint}</small>}</label>;
}
