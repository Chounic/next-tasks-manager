import TaskCard from "./TaskCard";
import { db, Task } from "@/lib/kysely";

export default async function TaskBoard({ userId }: { userId: string }) {
  const columns = ["Backlog", "Ready", "In Progress", "Done"];
  let tasks: Task[] = [];

  try {
    tasks = await db
      .selectFrom("tasks")
      .where("userId", "=", userId)
      .selectAll()
      .execute();
  } catch (e: any) {
    console.error(e);
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {columns.map((column) => (
        <div key={column} className="bg-gray-100 p-4 rounded-lg">
          <h2 className="font-semibold mb-2">{column}</h2>
          {tasks
            .filter(
              (task) =>
                task.status.toLowerCase() ===
                column.toLowerCase().replace(" ", "-")
            )
            .map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
        </div>
      ))}
    </div>
  );
}
