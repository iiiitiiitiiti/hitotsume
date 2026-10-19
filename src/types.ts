export type Task = {
  id: string;
  title: string;
  /** 2分でできる最初の操作 */
  firstStep: string;
  createdAt: number;
};

export type DoneRecord = { id: string; title: string; doneAt: number };

export type AppData = {
  version: 1;
  current: Task | null;
  /** 新しい順 */
  done: DoneRecord[];
};

export type Theme = "light" | "dark";

/** 書きかけの文。start は今やることを決める欄、next は次の一手の欄、edit は書き直しの欄 */
export type Draft = {
  mode: "start" | "next" | "edit";
  taskId: string | null;
  title: string;
  firstStep: string;
};
