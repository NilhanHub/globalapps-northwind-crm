import type {
  ButtonHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
} from 'react';
import { forwardRef, useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Search } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 1. Button component
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}
export function Button({ className = '', variant = 'primary', ...props }: ButtonProps) {
  const variantClasses = {
    primary:
      'bg-burgundy text-white hover:bg-burgundy-deep shadow-burgundy/20 shadow-md focus-visible:ring-burgundy/40',
    secondary: 'bg-paper text-ink border border-line hover:bg-porcelain focus-visible:ring-line/60',
    ghost: 'bg-transparent text-ink-soft hover:bg-porcelain focus-visible:ring-porcelain/80',
    danger: 'bg-danger text-white hover:bg-danger/95 shadow-md focus-visible:ring-danger/40',
  };

  return (
    <button
      className={cn(
        'nw-button',
        `nw-button--${variant}`,
        'inline-flex items-center justify-center rounded-sm px-4 py-2 font-ui font-semibold text-sm transition-all duration-140 active:translate-y-0 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

// 2. IconButton component
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', variant = 'secondary', ...props },
  ref,
) {
  const variantClasses = {
    primary: 'bg-burgundy text-white hover:bg-burgundy-deep',
    secondary: 'bg-paper text-ink border border-line hover:bg-porcelain',
    ghost: 'bg-transparent text-ink-soft hover:bg-porcelain',
  };

  return (
    <button
      ref={ref}
      className={cn(
        'nw-icon-button inline-flex items-center justify-center w-9 h-9 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/45 cursor-pointer',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});

// 3. Input component
export type InputProps = InputHTMLAttributes<HTMLInputElement>;
export function Input({ className = '', type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/45 focus-visible:border-copper disabled:cursor-not-allowed disabled:opacity-50 transition-all',
        className,
      )}
      {...props}
    />
  );
}

// 4. Textarea component
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export function Textarea({ className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm placeholder:text-ink-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/45 focus-visible:border-copper disabled:cursor-not-allowed disabled:opacity-50 transition-all resize-y',
        className,
      )}
      {...props}
    />
  );
}

// 5. Label component
export function Label({ className = '', ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-semibold font-ui text-ink-soft/90 select-none leading-none', className)}
      {...props}
    />
  );
}

// 6. Field & Form Helpers
export function FieldGroup({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-2', className)} {...props} />;
}

export function Field({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

export function FieldError({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs font-semibold text-danger mt-1', className)} {...props} />;
}

export function FieldHint({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-ink-soft/60 mt-1', className)} {...props} />;
}

// 7. Badge component
export function Badge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'burgundy' | 'copper' | 'sage' | 'ink' }>) {
  const toneClasses = {
    neutral: 'bg-mist text-ink-soft',
    burgundy: 'bg-burgundy/10 text-burgundy',
    copper: 'bg-copper/10 text-copper',
    sage: 'bg-sage/10 text-sage',
    ink: 'bg-ink text-white',
  };

  return (
    <span
      className={cn(
        'nw-badge',
        `nw-badge--${tone}`,
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold font-data uppercase tracking-wider',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

// 8. RelationshipThread component
export function RelationshipThread(props: {
  target: string;
  mutual: string;
  owner: string;
  stage: string;
  compact?: boolean;
}) {
  const label = `${props.target} via ${props.mutual}, owned by ${props.owner}, at ${props.stage}`;
  return (
    <svg
      className={cn('nw-thread w-full block overflow-visible text-ink-soft', props.compact && 'nw-thread--compact')}
      role="img"
      aria-label={label}
      viewBox="0 0 640 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        className="nw-thread__line stroke-copper fill-none stroke-[2.5px] stroke-linecap-round"
        d="M52 50 C150 8 190 92 290 50 S430 8 530 50"
      />
      <circle
        className="nw-thread__node nw-thread__node--target fill-burgundy stroke-paper stroke-4"
        cx="52"
        cy="50"
        r="9"
      />
      <circle
        className="nw-thread__node nw-thread__node--mutual fill-copper stroke-paper stroke-4"
        cx="290"
        cy="50"
        r="9"
      />
      <circle
        className="nw-thread__node nw-thread__node--owner fill-sage stroke-paper stroke-4"
        cx="530"
        cy="50"
        r="9"
      />
      <text x="52" y="82" textAnchor="middle" className="fill-current font-ui font-semibold text-[11px]">
        {props.target}
      </text>
      <text x="290" y="82" textAnchor="middle" className="fill-current font-ui font-semibold text-[11px]">
        {props.mutual}
      </text>
      <text x="530" y="82" textAnchor="middle" className="fill-current font-ui font-semibold text-[11px]">
        {props.owner}
      </text>
      <text className="nw-thread__stage fill-burgundy font-data text-xs uppercase" x="590" y="22" textAnchor="end">
        {props.stage}
      </text>
    </svg>
  );
}

// 9. Dialog component (improved with smooth transitions)
export function Dialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  if (props.open && !opener.current && typeof document !== 'undefined')
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useEffect(
    () => () => {
      if (opener.current?.isConnected) opener.current.focus();
    },
    [],
  );
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="nw-dialog__overlay fixed inset-0 z-80 bg-ink/50 backdrop-blur-sm transition-all duration-150" />
        <DialogPrimitive.Content
          className="nw-dialog__content fixed z-81 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 grid grid-rows-[auto_minmax(0,1fr)_auto] w-[min(720px,calc(100vw-32px))] max-h-[min(820px,calc(100dvh-32px))] overflow-hidden border border-line rounded-lg bg-paper shadow-lg focus:outline-none"
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
            opener.current = null;
          }}
        >
          <header className="nw-dialog__header flex items-center justify-between gap-4 px-6 py-5 border-b border-line">
            <div>
              <DialogPrimitive.Title className="nw-dialog__title m-0 text-ink font-display font-semibold text-2xl leading-tight">
                {props.title}
              </DialogPrimitive.Title>
              {props.description ? (
                <DialogPrimitive.Description className="nw-dialog__description mt-1 text-ink-soft font-ui text-sm">
                  {props.description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="nw-icon-button inline-flex items-center justify-center w-9 h-9 border border-line rounded-full bg-paper text-ink cursor-pointer hover:bg-porcelain transition-all"
              aria-label="Close dialog"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </header>
          <div className="nw-dialog__body min-w-0 overflow-auto overscroll-contain p-6">{props.children}</div>
          {props.footer ? (
            <footer className="nw-dialog__footer flex items-center justify-end gap-4 px-6 py-5 border-t border-line">
              {props.footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// 10. Card structure
export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-md border border-line bg-paper p-6 shadow-sm transition-all duration-140', className)}
      {...props}
    />
  );
}

export function CardHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 pb-4 mb-4 border-b border-line/60', className)} {...props} />;
}

export function CardTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display font-semibold text-lg text-ink leading-none', className)} {...props} />;
}

export function CardDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-ink-soft/70 font-ui', className)} {...props} />;
}

export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-sm text-ink font-ui', className)} {...props} />;
}

export function CardFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-3 pt-4 mt-4 border-t border-line/60', className)}
      {...props}
    />
  );
}

// 11. Select/NativeSelect component
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}
export function Select({ className = '', ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/45 focus-visible:border-copper disabled:cursor-not-allowed disabled:opacity-50 transition-all cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

// 12. Checkbox component
export type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;
export function Checkbox({ className = '', ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4.5 w-4.5 rounded border border-line text-burgundy bg-paper focus:ring-2 focus:ring-burgundy/40 focus:ring-offset-paper transition-all cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

// 13. EmptyState component
export function EmptyState({
  title = 'No records found',
  description = 'Add a new record to get started.',
  icon,
  action,
  className = '',
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 py-14 border border-dashed border-line rounded-lg bg-paper/50',
        className,
      )}
    >
      {icon ? <div className="mb-4 text-copper">{icon}</div> : null}
      <h2 className="font-display font-semibold text-lg text-ink m-0">{title}</h2>
      <p className="text-sm text-ink-soft/75 max-w-sm mt-2 mb-4 leading-normal">{description}</p>
      {action}
    </div>
  );
}

// 14. Alert component
export function Alert({
  variant = 'warning',
  title,
  children,
  className = '',
}: PropsWithChildren<{
  variant?: 'warning' | 'danger' | 'info' | 'success';
  title?: string;
  className?: string;
}>) {
  const variantClasses = {
    warning: 'bg-copper/5 border-copper/30 text-ink-soft',
    danger: 'bg-danger/5 border-danger/20 text-danger',
    info: 'bg-sage/5 border-sage/25 text-ink-soft',
    success: 'bg-sage/10 border-sage/30 text-ink',
  };

  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border p-4 text-sm font-ui leading-relaxed flex flex-col gap-1',
        variantClasses[variant],
        className,
      )}
    >
      {title ? <strong className="font-semibold text-ink">{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

// 15. Toolbar component
export function Toolbar({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 p-4 border border-line rounded-md bg-paper shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

// 16. SearchField component
export type SearchFieldProps = InputHTMLAttributes<HTMLInputElement>;
export function SearchField({ className = '', ...props }: SearchFieldProps) {
  return (
    <div className="relative flex items-center w-full max-w-xs">
      <Search size={16} className="absolute left-3 text-ink-soft/40 pointer-events-none" />
      <input
        type="search"
        className={cn(
          'flex h-9 w-full rounded-sm border border-line bg-paper pl-9 pr-3 py-1.5 text-sm placeholder:text-ink-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/45 focus-visible:border-copper disabled:cursor-not-allowed disabled:opacity-50 transition-all',
          className,
        )}
        {...props}
      />
    </div>
  );
}

// 17. StatCard component
export function StatCard({
  title,
  value,
  description,
  tone = 'neutral',
  className = '',
}: {
  title: string;
  value: string | number;
  description?: string;
  tone?: 'neutral' | 'burgundy' | 'copper' | 'sage';
  className?: string;
}) {
  const toneBorders = {
    neutral: 'border-line',
    burgundy: 'border-l-4 border-l-burgundy border-line',
    copper: 'border-l-4 border-l-copper border-line',
    sage: 'border-l-4 border-l-sage border-line',
  };

  return (
    <Card
      className={cn(
        'p-5 flex flex-col gap-1 hover:shadow-md transition-all duration-140',
        toneBorders[tone],
        className,
      )}
    >
      <span className="text-[11px] font-bold font-data text-ink-soft/50 uppercase tracking-wider leading-none">
        {title}
      </span>
      <span className="font-display font-semibold text-3xl text-ink leading-tight">{value}</span>
      {description ? <span className="text-xs text-ink-soft/60 font-ui mt-1">{description}</span> : null}
    </Card>
  );
}

// 18. Skeleton loading component
export function Skeleton({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded bg-mist/60', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// 19. PageHeader — promoted from apps/web page-header into @northwind/ui
// ---------------------------------------------------------------------------
export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  metrics?: Array<{ label: string; value: string | number }>;
  className?: string;
}
export function PageHeader({ eyebrow, title, description, actions, metrics, className = '' }: PageHeaderProps) {
  return (
    <header className={cn('nw-page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="nw-page-header__copy flex flex-col gap-1 min-w-0">
        <span className="text-[11px] font-bold font-data text-copper uppercase tracking-wider leading-none">
          {eyebrow}
        </span>
        <h1 className="font-display font-semibold text-3xl text-ink leading-tight m-0">{title}</h1>
        <p className="text-sm font-ui text-ink-soft/75 mt-0.5 mb-0 max-w-xl leading-relaxed">{description}</p>
      </div>

      {metrics ? (
        <dl className="nw-page-metrics flex items-baseline gap-6 m-0">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col items-center gap-0.5">
              <dt className="text-[10px] font-bold font-data text-ink-soft/50 uppercase tracking-wider leading-none">
                {metric.label}
              </dt>
              <dd className="font-display font-semibold text-2xl text-burgundy leading-tight m-0">{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? <div className="nw-page-actions flex items-center gap-3 shrink-0">{actions}</div> : null}
    </header>
  );
}

// ---------------------------------------------------------------------------
// 20. Tabs / TabList / Tab — accessible tab primitives
// ---------------------------------------------------------------------------
export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}
export function TabList({ className = '', children, ...props }: TabListProps) {
  return (
    <div role="tablist" className={cn('nw-tablist flex items-center gap-1 border-b border-line', className)} {...props}>
      {children}
    </div>
  );
}

export interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}
export function Tab({ className = '', selected = false, ...props }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        'nw-tab inline-flex items-center gap-1.5 px-3 py-2 -mb-px text-sm font-ui font-semibold border-b-2 transition-colors duration-140 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/45',
        selected
          ? 'border-burgundy text-burgundy'
          : 'border-transparent text-ink-soft hover:text-ink hover:border-line',
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 21. VisuallyHidden — sr-only text for screen readers
// ---------------------------------------------------------------------------
export function VisuallyHidden({ className = '', ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('sr-only', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// 22. Spinner — inline CSS-animated loading indicator
// ---------------------------------------------------------------------------
export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md';
}
export function Spinner({ size = 'sm', className = '', ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-[2.5px]',
  };

  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'nw-spinner inline-block rounded-full border-mist border-t-burgundy animate-spin',
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// 23. Avatar — monogram circle with tone
// ---------------------------------------------------------------------------
export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'burgundy' | 'copper' | 'sage' | 'ink';
  className?: string;
}
export function Avatar({ name, size = 'md', tone = 'burgundy', className = '' }: AvatarProps) {
  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-base',
  };
  const toneClasses = {
    burgundy: 'bg-burgundy/10 text-burgundy',
    copper: 'bg-copper/10 text-copper',
    sage: 'bg-sage/10 text-sage',
    ink: 'bg-ink/10 text-ink',
  };
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <span
      aria-label={name}
      className={cn(
        'nw-avatar inline-flex items-center justify-center rounded-full font-ui font-bold select-none shrink-0',
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
    >
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 24. Timeline / TimelineItem — audit-trail pattern
// ---------------------------------------------------------------------------
export interface TimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  children: ReactNode;
}
export function Timeline({ className = '', children, ...props }: TimelineProps) {
  return (
    <ol className={cn('nw-timeline relative list-none m-0 p-0 space-y-0', className)} {...props}>
      {children}
    </ol>
  );
}

export interface TimelineItemProps extends React.HTMLAttributes<HTMLLIElement> {
  tone?: 'burgundy' | 'copper' | 'sage' | 'ink';
}
export function TimelineItem({ tone = 'ink', className = '', children, ...props }: TimelineItemProps) {
  const dotTone = {
    burgundy: 'bg-burgundy',
    copper: 'bg-copper',
    sage: 'bg-sage',
    ink: 'bg-ink',
  };

  return (
    <li
      className={cn(
        'nw-timeline-item relative pl-7 pb-6 last:pb-0',
        // connector line
        'before:absolute before:left-[7px] before:top-3 before:bottom-0 before:w-px before:bg-line last:before:hidden',
        className,
      )}
      {...props}
    >
      {/* dot */}
      <span
        aria-hidden="true"
        className={cn('absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-paper', dotTone[tone])}
      />
      {children}
    </li>
  );
}
