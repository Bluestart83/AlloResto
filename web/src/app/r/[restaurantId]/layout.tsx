export default function PublicRestaurantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-page">
      {children}
      <footer className="public-footer text-center py-4 text-muted small border-top mt-5">
        Propulse par <strong>AlloResto</strong>
      </footer>
    </div>
  );
}
