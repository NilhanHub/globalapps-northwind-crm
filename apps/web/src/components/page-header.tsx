import type { ReactNode } from 'react';

export function PageHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  metrics?: Array<{ label: string; value: string | number }>;
}) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        <span className="page-eyebrow">{props.eyebrow}</span>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      {props.metrics ? (
        <dl className="page-metrics">
          {props.metrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {props.actions ? <div className="page-actions">{props.actions}</div> : null}
    </header>
  );
}
