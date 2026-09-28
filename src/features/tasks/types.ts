/**
 * Форма задачи, которая нужна доске на клиенте.
 *
 * Тип объявлен отдельно от Prisma, потому что сервер отдаёт чуть больше, чем
 * рисует карточка, а доска не должна падать из-за нового поля в схеме.
 */
export type BoardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  position: number;
  dueDate: string | null;
  estimate: number | null;
  assignee: { id: string; name: string } | null;
  spentMinutes: number;
  comments: number;
};

export type BoardMember = { id: string; name: string };
