import type { ReactNode } from 'react';

export function BrandHeader({ subtitle, action }: { subtitle: string; action?: ReactNode }) {
  return <header className="mx-auto mb-[clamp(30px,7vw,64px)] flex w-full max-w-[960px] items-center gap-3"><span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-[#147d7e] text-[28px] font-bold text-white">+</span><div><strong className="block text-[clamp(15px,2vw,17px)]">TriajeMedicoU</strong><span className="mt-0.5 block text-xs text-[#678096]">{subtitle}</span></div>{action}</header>;
}
