import type { InputHTMLAttributes } from 'react';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`min-h-11 w-full rounded-[10px] border border-[#cbdbe5] bg-[#fbfdfe] px-3 py-2.5 font-normal text-[#17324d] outline-none focus-visible:border-[#147d7e] focus-visible:outline-3 focus-visible:outline-[#147d7e33] ${props.className ?? ''}`} />;
}
