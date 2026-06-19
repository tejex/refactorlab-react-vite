export function EmptyDrawerRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="dead-code-row">
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </div>
  );
}
