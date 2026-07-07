import { Badge, RelationshipThread, Card } from '@northwind/ui';
import { PageHeader } from '../components/page-header';

const steps = [
  ['01', 'Find the route', 'Start with a specific target and a credible mutual relationship.'],
  ['02', 'Qualify the path', 'Confirm the mutual knows the target well enough to add trust.'],
  ['03', 'Prepare context', 'Give the mutual a concise reason, relevance and useful opening.'],
  ['04', 'Request the introduction', 'Ask clearly, without creating work or pressure.'],
  ['05', 'Confirm agreement', 'Record the mutual’s response and expected timing.'],
  ['06', 'Contact the target', 'Continue the context instead of restarting the conversation cold.'],
  ['07', 'Create momentum', 'Log replies, meetings and the next concrete action.'],
  ['08', 'Close the loop', 'Record the outcome and thank the mutual regardless of result.'],
];

export function ProcessPage() {
  return (
    <section className="workspace">
      <PageHeader
        eyebrow="Operating method"
        title="Warm introduction process"
        description="Eight deliberate moves that protect trust while turning a relationship into a useful conversation."
        metrics={[
          { label: 'Steps', value: 8 },
          { label: 'Principle', value: 'Trust' },
        ]}
      />
      <div className="process-thread">
        <RelationshipThread target="Target" mutual="Mutual contact" owner="Owner" stage="Conversation" />
      </div>
      <ol className="process-grid">
        {steps.map(([number, title, description], index) => (
          <li key={number}>
            <Card className="h-full min-h-[225px] flex flex-col p-5 hover:shadow-md transition-all">
              <header className="flex justify-between items-center mb-4">
                <span className="text-ink-soft/40 font-bold font-data text-sm">{number}</span>
                <Badge tone={index < 3 ? 'copper' : index < 6 ? 'burgundy' : 'sage'}>
                  {index < 3 ? 'Prepare' : index < 6 ? 'Introduce' : 'Progress'}
                </Badge>
              </header>
              <h2 className="text-lg font-display font-semibold text-ink mt-auto mb-2 leading-tight">{title}</h2>
              <p className="text-xs text-ink-soft/75 leading-relaxed">{description}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
