import React, { useCallback, useEffect, useId, useState } from 'react';
import en from '@/i18n/en.json';

export interface RulesSection {
  readonly id: string;
  readonly title: string;
  readonly body: React.ReactNode;
}

export interface RulesPanelProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly sections: readonly RulesSection[];
  readonly attribution?: string;
}

export function RulesPanel({
  title,
  subtitle,
  isOpen,
  onToggle,
  sections,
  attribution,
}: RulesPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const dialogId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onToggle]);

  const toggleSection = useCallback(
    (id: string) => setOpenId(prev => (prev === id ? null : id)),
    [],
  );

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={en.table.rulesOpen}
        className={[
          'group absolute left-0 top-1/2 -translate-y-1/2 z-20',
          'flex items-center justify-center',
          'w-10 h-32 pl-1 rounded-r-2xl',
          'bg-night-raised/90 backdrop-blur',
          'border border-l-0 border-brass/30',
          'shadow-[6px_0_24px_-12px_rgba(0,0,0,0.7)]',
          'hover:border-brass/60 hover:bg-night-raised',
          'transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
        ].join(' ')}
      >
        <span className="[writing-mode:vertical-rl] rotate-180 font-display text-[0.7rem] uppercase tracking-[0.35em] text-brass-bright/80 group-hover:text-brass-bright">
          {en.rules.title}
        </span>
        <span
          aria-hidden
          className="absolute top-3 left-1/2 -translate-x-1/2 text-brass/80 text-base leading-none"
        >
          ❦
        </span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-labelledby={`${dialogId}-title`}
      aria-modal={false}
      className={[
        'absolute left-0 top-0 bottom-0 z-30',
        'w-[min(420px,92vw)]',
        'flex flex-col',
        'bg-parchment text-parchment-ink',
        'shadow-drawer border-r border-parchment-rule/50',
        'animate-drawer-in',
      ].join(' ')}
    >
      <header className="relative px-6 pt-6 pb-4 border-b border-parchment-rule/40">
        <h2
          id={`${dialogId}-title`}
          className="font-display text-3xl leading-none tracking-tight text-parchment-ink"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 font-sans text-[0.8rem] uppercase tracking-[0.25em] text-parchment-ink/60">
            {subtitle}
          </p>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={en.table.rulesClose}
          className={[
            'absolute top-5 right-4 w-9 h-9 rounded-full',
            'flex items-center justify-center',
            'bg-parchment-warm text-parchment-ink/70',
            'border border-parchment-rule/60',
            'hover:text-parchment-ink hover:bg-parchment',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
            'transition-colors',
          ].join(' ')}
        >
          <span aria-hidden className="text-lg leading-none">‹</span>
        </button>
      </header>

      <div className="relative px-6 py-4 border-b border-parchment-rule/30">
        <input
          type="search"
          placeholder={en.rules.searchPlaceholder}
          className={[
            'w-full px-4 py-2 rounded-full',
            'bg-parchment-warm border border-parchment-rule/50',
            'font-sans text-sm text-parchment-ink placeholder:text-parchment-ink/45',
            'focus:outline-none focus:border-brass/70 focus:bg-parchment',
            'transition-colors',
          ].join(' ')}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {sections.length === 0 ? (
          <p className="px-2 py-8 text-center font-sans text-sm italic text-parchment-ink/60">
            {en.rules.emptyState}
          </p>
        ) : (
          sections.map(sec => {
            const open = openId === sec.id;
            return (
              <section
                key={sec.id}
                className={[
                  'rounded-lg border transition-colors',
                  open
                    ? 'border-brass/60 bg-parchment-warm/70'
                    : 'border-parchment-rule/30 bg-parchment-warm/30 hover:bg-parchment-warm/60',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  aria-expanded={open}
                  aria-controls={`${dialogId}-sec-${sec.id}`}
                  className={[
                    'w-full flex items-center gap-3 px-4 py-3',
                    'font-display text-lg text-left text-parchment-ink',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/70 rounded-lg',
                  ].join(' ')}
                >
                  <span
                    aria-hidden
                    className={`text-brass transition-transform ${open ? 'rotate-90' : ''}`}
                  >
                    ›
                  </span>
                  <span className="flex-1">{sec.title}</span>
                </button>
                {open && (
                  <div
                    id={`${dialogId}-sec-${sec.id}`}
                    className="px-5 pb-4 pt-1 font-sans text-[0.92rem] leading-relaxed text-parchment-ink/85 [&_p+p]:mt-3"
                  >
                    {typeof sec.body === 'string' ? <p>{sec.body}</p> : sec.body}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <footer className="px-6 py-4 border-t border-parchment-rule/40 bg-parchment-warm/60">
        <p className="font-sans text-[0.7rem] uppercase tracking-[0.2em] text-parchment-ink/55">
          {attribution ?? en.rules.attributionFallback}
        </p>
      </footer>
    </div>
  );
}
