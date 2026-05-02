export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        <p className="text-muted-foreground text-sm">页面开发中...</p>
      </div>
    </div>
  )
}
