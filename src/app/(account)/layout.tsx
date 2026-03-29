export default function AccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Account-level layout without the league workspace shell
  // This provides a clean, non-league-specific container for account pages
  return <>{children}</>;
}