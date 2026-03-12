const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  return <div className="dark:bg-dark h-full overflow-y-auto">{children}</div>;
};
export default PublicLayout;
