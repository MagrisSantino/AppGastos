import type { Metadata } from "next";

import { ControlSemanalView } from "./control-semanal-view";

export const metadata: Metadata = {
  title: "Control semanal",
};

export default function ControlSemanalPage() {
  return <ControlSemanalView />;
}
