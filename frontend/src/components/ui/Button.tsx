import type { ButtonHTMLAttributes } from 'react';

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`min-h-[46px] rounded-[10px] border-0 bg-[#147d7e] px-4 py-3 font-bold text-white hover:bg-[#0e6869] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-3 focus-visible:outline-[#147d7e55] ${props.className ?? ''}`} />;
}
