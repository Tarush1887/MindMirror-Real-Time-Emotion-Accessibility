export default function Navbar() {
  return (
    <nav className="flex justify-between items-center p-4 bg-gray-100 dark:bg-gray-900 shadow-md">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">MindMirror</h1>
      <div className="space-x-4">
        <a href="/" className="text-gray-900 dark:text-gray-100 hover:underline">Home</a>
        <a href="/dashboard" className="text-gray-900 dark:text-gray-100 hover:underline">Dashboard</a>
      </div>
    </nav>
  );
}
