import Navbar from '../components/Navbar';
import Card from '../components/Card';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <Navbar />
      <main className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
          Welcome to MindMirror
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card title="Emotion Detection" description="Detect emotions using AI." />
          <Card title="Mood Tracker" description="Track your mood daily." />
          <Card title="Analytics" description="Visualize emotional trends." />
        </div>
      </main>
    </div>
  );
}
