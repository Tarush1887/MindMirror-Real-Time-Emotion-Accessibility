export default function Card({ title, description }) {
  return (
    <div className="card-hover bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md transition-all">
      <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">{title}</h2>
      <p className="text-gray-700 dark:text-gray-300">{description}</p>
    </div>
  );
}
