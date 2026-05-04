import type { ReactNode } from "react";
import "./NoticeBlock.css";

type NoticeBlockProps = {
  children: ReactNode;
  tone?: "neutral" | "error";
};

export function NoticeBlock({ children, tone = "neutral" }: NoticeBlockProps) {
  return (
    <div
      className={`notice-block${tone === "error" ? " is-error" : ""}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
