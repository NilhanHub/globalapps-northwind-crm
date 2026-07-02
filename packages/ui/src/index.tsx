import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Button({
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`nw-button nw-button--${variant} ${className}`.trim()} {...props} />;
}

export function Badge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'burgundy' | 'copper' | 'sage' | 'ink' }>) {
  return <span className={`nw-badge nw-badge--${tone}`}>{children}</span>;
}

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
      className={`nw-thread ${props.compact ? 'nw-thread--compact' : ''}`}
      role="img"
      aria-label={label}
      viewBox="0 0 640 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <path className="nw-thread__line" d="M52 50 C150 8 190 92 290 50 S430 8 530 50" />
      <circle className="nw-thread__node nw-thread__node--target" cx="52" cy="50" r="9" />
      <circle className="nw-thread__node nw-thread__node--mutual" cx="290" cy="50" r="9" />
      <circle className="nw-thread__node nw-thread__node--owner" cx="530" cy="50" r="9" />
      <text x="52" y="82" textAnchor="middle">
        {props.target}
      </text>
      <text x="290" y="82" textAnchor="middle">
        {props.mutual}
      </text>
      <text x="530" y="82" textAnchor="middle">
        {props.owner}
      </text>
      <text className="nw-thread__stage" x="590" y="22" textAnchor="end">
        {props.stage}
      </text>
    </svg>
  );
}

export function Dialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="nw-dialog__overlay" />
        <DialogPrimitive.Content className="nw-dialog__content">
          <header className="nw-dialog__header">
            <div>
              <DialogPrimitive.Title className="nw-dialog__title">{props.title}</DialogPrimitive.Title>
              {props.description ? (
                <DialogPrimitive.Description className="nw-dialog__description">
                  {props.description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close className="nw-icon-button" aria-label="Close dialog">
              <X size={18} />
            </DialogPrimitive.Close>
          </header>
          <div className="nw-dialog__body">{props.children}</div>
          {props.footer ? <footer className="nw-dialog__footer">{props.footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
