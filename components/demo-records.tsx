"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

type RecordGroup = {
  label: string;
  name: string;
  items: {
    id: string;
    author: string | null;
    content: string;
    sourceTitle: string;
  }[];
};

export function DemoRecords({ groups }: { groups: RecordGroup[] }) {
  const [selected, setSelected] = useState(
    groups.some((group) => group.label === "decision")
      ? "decision"
      : (groups[0]?.label ?? ""),
  );
  const active = groups.find((group) => group.label === selected);

  return (
    <section className="grid gap-4" aria-labelledby="demo-items-heading">
      <div className="section-heading">
        <div>
          <h2 id="demo-items-heading">분류된 기록</h2>
          <p>대화의 맥락이 궁금하다면, 기록을 펼쳐보세요.</p>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="empty-state">아직 분류된 기록이 없습니다.</p>
      ) : (
        <>
          <div
            className="segmented-control"
            role="group"
            aria-label="기록 분류 선택"
          >
            {groups.map((group) => (
              <button
                type="button"
                key={group.label}
                aria-pressed={selected === group.label}
                aria-controls="demo-record-list"
                onClick={() => setSelected(group.label)}
              >
                {group.name}
                <span>{group.items.length}</span>
              </button>
            ))}
          </div>
          <div id="demo-record-list" className="record-list" aria-live="polite">
            {active?.items.map((item) => (
              <details className="record-item" key={item.id}>
                <summary>
                  <div className="record-meta">
                    <Icon name="hash" size={13} />
                    <span>{item.sourceTitle}</span>
                    <span>·</span>
                    <span>{item.author ?? "작성자 미상"}</span>
                  </div>
                  <p className="line-clamp-2">{item.content}</p>
                  <span className="record-expand">
                    원문 펼쳐보기 <Icon name="chevron" size={11} />
                  </span>
                </summary>
                <p>{item.content}</p>
              </details>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
