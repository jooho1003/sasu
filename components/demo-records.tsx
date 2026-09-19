"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export type RecordKind = "slack" | "meeting" | "document";

type RecordGroup = {
  label: string;
  name: string;
  items: {
    id: string;
    author: string | null;
    content: string;
    sourceId: string;
    sourceTitle: string;
    sourceKind: RecordKind;
    hasDecision?: boolean;
  }[];
};

const KINDS = {
  slack: { name: "슬랙", icon: "hash" },
  meeting: { name: "회의", icon: "video" },
  document: { name: "문서", icon: "file" },
} as const;

export function DemoRecords({
  dept,
  groups,
  initialKind,
}: {
  dept: string;
  groups: RecordGroup[];
  initialKind?: RecordKind;
}) {
  const [selected, setSelected] = useState(
    groups.some((group) => group.label === "decision")
      ? "decision"
      : (groups[0]?.label ?? ""),
  );
  const [kind, setKind] = useState<RecordKind | "all">(initialKind ?? "all");
  const active = groups.find((group) => group.label === selected);
  const visible = (active?.items ?? []).filter(
    (item) => kind === "all" || item.sourceKind === kind,
  );

  return (
    <section className="grid gap-4" aria-labelledby="demo-items-heading">
      <div className="section-heading">
        <div>
          <h2 id="demo-items-heading">분류된 기록</h2>
          <p>
            기록을 누르면 어디서 나온 말인지, 어떤 결정으로 이어졌는지 확인할
            수 있습니다.
          </p>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="empty-state">아직 분류된 기록이 없습니다.</p>
      ) : (
        <>
          <div className="record-filters">
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
                  onClick={() => {
                    setSelected(group.label);
                  }}
                >
                  {group.name}
                  <span>{group.items.length}</span>
                </button>
              ))}
            </div>
            <div
              className="segmented-control"
              role="group"
              aria-label="기록 출처 선택"
            >
              {(["all", "slack", "meeting", "document"] as const).map(
                (value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={kind === value}
                    aria-controls="demo-record-list"
                    onClick={() => {
                      setKind(value);
                      }}
                  >
                    {value === "all" ? "전체 출처" : KINDS[value].name}
                  </button>
                ),
              )}
            </div>
          </div>
          <div id="demo-record-list" className="record-list" aria-live="polite">
            {visible.length === 0 ? (
              <p className="empty-state">이 조건에 맞는 기록이 없습니다.</p>
            ) : null}
            {visible.map(item=><article className="record-item" key={item.id}>
              <Link className="record-toggle" href={`/demo/d/${dept}/documents?source=${encodeURIComponent(item.sourceId)}`} aria-label={`${item.sourceTitle} ${item.author??"작성자 모름"} 원문 보기`}>
                <span className="record-meta"><Icon name={KINDS[item.sourceKind].icon} size={13}/><span>{item.sourceTitle}</span><span>·</span><span>{item.author??"작성자 모름"}</span></span>
                <span className="record-content line-clamp-2">{item.content}</span>
                <span className="record-expand">원문 <Icon name="arrow" size={13}/></span>
              </Link>
              {item.hasDecision?<Link className="text-link px-4 pb-3" href={`/demo/d/${dept}/ledger?source=${encodeURIComponent(item.sourceId)}`}>→ 결정 기록</Link>:null}
            </article>)}

          </div>
        </>
      )}
    </section>
  );
}
