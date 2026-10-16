"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { BookOpen, ChevronRight, Focus, GitBranch, Maximize2, Minus, Pencil, PenLine, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { statusLabels, type Question, type StudyData, type StudyGroup, type Topic } from "@/lib/study";

type Props = {
  data: StudyData; activeTopic: string; activeQuestion: string;
  editGroup: (group: StudyGroup) => void; addTopic: (group: StudyGroup) => void;
  editTopic: (group: StudyGroup, topic: Topic) => void;
  addQuestion: (topic: Topic) => void; openQuestion: (group: StudyGroup, topic: Topic, question: Question) => void;
  practiceTopic: (topic: Topic) => void; practiceQuestion: (topic: Topic, question: Question) => void;
};
const themes = ["sage", "blue", "amber", "rose", "violet"];
type MapNode = { key: string; x: number; y: number; width: number; height: number; type: "root" | "group" | "topic" | "question" | "answer"; group?: StudyGroup; topic?: Topic; question?: Question; index: number; theme: string };

export default function ArchitectureMap(props: Props) {
  const { data } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(0.8);
  const [fitted, setFitted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const zoomAnchor = useRef<{ x: number; y: number; graphX: number; graphY: number } | null>(null);
  const pan = useRef<{x: number; y: number; left: number; top: number} | null>(null);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    function wheelZoom(event: WheelEvent) {
      if (!event.altKey || !event.deltaY) return;
      const drawing = drawingRef.current;
      if (!drawing || !viewport) return;
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
      const next = Math.max(0.25, Math.min(1.8, zoomRef.current * Math.exp(-Math.max(-240, Math.min(240, pixels)) * 0.0018)));
      if (next === zoomRef.current) return;
      const rect = drawing.getBoundingClientRect();
      // Read the rendered scale so rapid wheel events can accumulate before React commits.
      const renderedZoom = rect.width / drawing.offsetWidth;
      zoomAnchor.current = { x: event.clientX, y: event.clientY, graphX: (event.clientX - rect.left) / renderedZoom, graphY: (event.clientY - rect.top) / renderedZoom };
      zoomRef.current = next;
      setZoom(next);
    }
    viewport.addEventListener("wheel", wheelZoom, { passive: false });
    return () => viewport.removeEventListener("wheel", wheelZoom);
  }, []);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const anchor = zoomAnchor.current;
    const viewport = scrollRef.current;
    const drawing = drawingRef.current;
    if (!anchor || !viewport || !drawing) return;
    const rect = drawing.getBoundingClientRect();
    viewport.scrollLeft += rect.left + anchor.graphX * zoom - anchor.x;
    viewport.scrollTop += rect.top + anchor.graphY * zoom - anchor.y;
    zoomAnchor.current = null;
  }, [zoom]);
  const nodes: MapNode[] = [];
  const lines: { from: MapNode; to: MapNode; color: string }[] = [];
  let cursor = 38;
  let contentWidth = 712;
  data.groups.forEach((group, gi) => {
    const groupStart = cursor;
    const theme = themes[gi % themes.length];
    const groupNode: MapNode = { key: group.id, x: 242, y: cursor, width: 165, height: 62, type: "group", group, index: gi, theme };
    const topicNodes: MapNode[] = [];
    if (!collapsed.has(group.id)) group.topics.forEach((topic, ti) => {
      const topicStart = cursor;
      const questionNodes: MapNode[] = [];
      if (expanded.has(topic.id)) {
        if (topic.questions.length) contentWidth = Math.max(contentWidth, 1010);
        topic.questions.forEach((question, qi) => {
          const rowHeight = answers.has(question.id) ? 156 : 100;
          const questionNode: MapNode = { key: question.id, x: 744, y: cursor + rowHeight / 2 - 42, width: 230, height: 84, type: "question", group, topic, question, index: qi, theme };
          if (answers.has(question.id)) {
            const answerNode: MapNode = { ...questionNode, key: `answer-${question.id}`, x: 1040, y: cursor + 8, width: 280, height: 140, type: "answer" };
            nodes.push(answerNode); lines.push({ from: questionNode, to: answerNode, color: theme });
            contentWidth = 1360;
          }
          questionNodes.push(questionNode); nodes.push(questionNode); cursor += rowHeight;
        });
        if (!topic.questions.length) cursor += 48;
      } else cursor += 48;
      const topicNode: MapNode = { key: topic.id, x: 477, y: topicStart + (cursor - topicStart) / 2 - 25, width: 190, height: 50, type: "topic", group, topic, index: ti, theme };
      nodes.push(topicNode); topicNodes.push(topicNode);
      questionNodes.forEach(questionNode => lines.push({ from: topicNode, to: questionNode, color: theme }));
      cursor += 10;
    });
    if (collapsed.has(group.id) || !group.topics.length) cursor += 72;
    groupNode.y = groupStart + (cursor - groupStart) / 2 - 31;
    nodes.push(groupNode);
    topicNodes.forEach(topicNode => lines.push({ from: groupNode, to: topicNode, color: theme }));
    cursor += 16;
  });
  const height = Math.max(360, cursor + 14);
  const root: MapNode = { key: "root", x: 28, y: height / 2 - 49, width: 150, height: 98, type: "root", index: 0, theme: "sage" };
  nodes.push(root);
  nodes.filter(node => node.type === "group").forEach(node => lines.push({ from: root, to: node, color: node.theme }));

  function fit() {
    const element = scrollRef.current; if (!element) return;
    setZoom(Math.max(0.25, Math.min(1.05, (element.clientWidth - 30) / contentWidth, (element.clientHeight - 30) / height)));
    element.scrollTo({ left: 0, top: 0 });
  }
  useEffect(() => { if (!fitted) { fit(); setFitted(true); } });
  useEffect(() => { if (!props.activeTopic) return; setExpanded(old => new Set([...old, props.activeTopic])); const group = data.groups.find(g => g.topics.some(t => t.id === props.activeTopic)); if (group) setCollapsed(old => { const next = new Set(old); next.delete(group.id); return next; }); }, [props.activeTopic, props.activeQuestion]);
  useEffect(() => { if (props.activeQuestion) setAnswers(old => new Set([...old, props.activeQuestion])); }, [props.activeQuestion]);
  useEffect(() => { if (!scrollRef.current) return; scrollRef.current.scrollTo({left: Math.max(0, contentWidth * zoom - scrollRef.current.clientWidth + 30), behavior: "smooth"}); }, [contentWidth]);
  function toggle(setter: typeof setExpanded, id: string) { setter(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button,input,a") || event.button !== 0) return;
    const element = scrollRef.current; if (!element) return;
    pan.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
    element.setPointerCapture(event.pointerId); element.classList.add("panning");
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pan.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = pan.current.left - event.clientX + pan.current.x;
    scrollRef.current.scrollTop = pan.current.top - event.clientY + pan.current.y;
  }
  function endPan() { pan.current = null; scrollRef.current?.classList.remove("panning"); }

  return <section className="architecture-board" aria-label="完整近代史架构图">
    <div className="graph-toolbar"><div className="graph-path"><GitBranch size={16} /><span>总框架</span><ChevronRight size={12}/><span>5 组</span><ChevronRight size={12}/><span>专题</span><ChevronRight size={12}/><span>论述题</span><ChevronRight size={12}/><span>答案</span></div><div><button onClick={() => { setCollapsed(new Set()); setExpanded(new Set(data.groups.flatMap(g => g.topics.map(t => t.id)))); }}><Plus size={13}/>展开题目</button><button onClick={() => { setCollapsed(new Set()); setExpanded(new Set()); setAnswers(new Set()); }}><Minus size={13}/>收起题目</button></div></div>
    <div className="graph-viewport" ref={scrollRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endPan} onPointerCancel={endPan}>
      <div className="graph-space" style={{ width: contentWidth * zoom + 30, height: height * zoom + 30, minWidth: "100%", minHeight: "100%", "--scaled-width": `${contentWidth * zoom}px` } as CSSProperties}><div ref={drawingRef} className="graph-drawing" style={{ width: contentWidth, height, transform: `scale(${zoom})`, "--node-font": `${Math.min(21, 14 / zoom)}px` } as CSSProperties}>
        <svg width={contentWidth} height={height} className="graph-lines" aria-hidden="true">{lines.map(({ from, to, color }) => { const x1 = from.x + from.width, y1 = from.y + from.height / 2, x2 = to.x, y2 = to.y + to.height / 2; return <path key={`${from.key}-${to.key}`} className={`theme-${color}`} d={`M ${x1} ${y1} C ${x1 + (x2-x1)/2} ${y1}, ${x2 - (x2-x1)/2} ${y2}, ${x2} ${y2}`} />; })}</svg>
        {nodes.map(node => <div key={node.key} className={`graph-node graph-${node.type} theme-${node.theme} ${props.activeQuestion === node.question?.id && node.type === "question" ? "selected" : ""}`} style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>
          {node.type === "root" && <><GitBranch size={23}/><strong>中国近现代史</strong><span>我的论述题架构</span></>}
          {node.type === "group" && node.group && <><button className="graph-node-main" onClick={() => toggle(setCollapsed,node.group!.id)} aria-expanded={!collapsed.has(node.group.id)}><span className="graph-group-label"><b>{String(node.index + 1).padStart(2,"0")}</b>{node.group.title}</span><strong>{node.group.subtitle}</strong></button><div className="graph-node-actions"><button title="编辑分组" aria-label={`编辑${node.group.title}`} onClick={() => props.editGroup(node.group!)}><Pencil size={13}/></button><button title="新增专题" aria-label={`在${node.group.title}新增专题`} onClick={() => props.addTopic(node.group!)}><Plus size={15}/></button></div><button className="graph-branch-toggle" aria-label={`${collapsed.has(node.group.id) ? "展开" : "收起"}${node.group.title}`} onClick={() => toggle(setCollapsed,node.group!.id)}>{collapsed.has(node.group.id) ? <Plus size={11}/> : <Minus size={11}/>}</button></>}
          {node.type === "topic" && node.topic && <><button className="graph-node-main" onClick={() => node.topic!.questions.length ? toggle(setExpanded,node.topic!.id) : props.addQuestion(node.topic!)} aria-expanded={expanded.has(node.topic.id)}><strong>{node.topic.title}</strong><span className="graph-topic-count">{node.topic.questions.length} 题</span></button><div className="graph-node-actions"><button title="默写这个专题下的题目" aria-label={`默写${node.topic.title}的题目`} onClick={() => props.practiceTopic(node.topic!)}><PenLine size={13}/></button><button title="编辑专题" aria-label={`编辑${node.topic.title}`} onClick={() => props.editTopic(node.group!,node.topic!)}><Pencil size={12}/></button><button title="新增论述题" aria-label={`为${node.topic.title}新增题目`} onClick={() => props.addQuestion(node.topic!)}><Plus size={15}/></button></div>{node.topic.questions.length > 0 && <button className="graph-branch-toggle" aria-label={`${expanded.has(node.topic.id) ? "收起" : "展开"}${node.topic.title}题目`} onClick={() => toggle(setExpanded,node.topic!.id)}>{expanded.has(node.topic.id) ? <Minus size={11}/> : <Plus size={11}/>}</button>}</>}
          {node.type === "question" && node.question && <><button className="graph-node-main" onClick={() => toggle(setAnswers,node.question!.id)} aria-expanded={answers.has(node.question.id)}><span className="graph-question-number">{node.index + 1}.</span><strong>{node.question.title}</strong><span className={`status-dot status-${node.question.status}`} title={statusLabels[node.question.status]}/></button><div className="graph-node-actions"><button title="默写答案" aria-label={`默写${node.question.title}`} onClick={() => props.practiceQuestion(node.topic!,node.question!)}><PenLine size={13}/></button><button title="查看或编辑答案" aria-label={`编辑${node.question.title}`} onClick={() => props.openQuestion(node.group!,node.topic!,node.question!)}><Pencil size={13}/></button></div><button className="graph-branch-toggle" aria-label={`${answers.has(node.question.id) ? "收起" : "展开"}答案`} onClick={() => toggle(setAnswers,node.question!.id)}>{answers.has(node.question.id) ? <Minus size={11}/> : <Plus size={11}/>}</button></>}
          {node.type === "answer" && node.question && <><div className="graph-answer-label"><BookOpen size={14}/>答案要点<button aria-label={`编辑${node.question.title}的答案`} onClick={() => props.openQuestion(node.group!,node.topic!,node.question!)}><Pencil size={12}/></button></div><button className="graph-answer-content" onClick={() => props.openQuestion(node.group!,node.topic!,node.question!)}>{node.question.answer || "点击这里，录入你的标准答案。\n建议按 1、2、3 分条整理。"}</button><button className="graph-answer-open" onClick={() => props.openQuestion(node.group!,node.topic!,node.question!)}>{node.question.answer ? "查看完整答案" : "添加标准答案"}<ChevronRight size={12}/></button></>}
        </div>)}
      </div></div>
    </div>
    <div className="graph-bottom"><span className="graph-guide"><span/><strong>点节点展开</strong><span> · </span>点 ＋ 新增<span> · </span>拖动空白处移动<span> · </span>⌥ / Alt＋滚轮缩放</span><div className="graph-zoom"><button title="缩小" aria-label="缩小架构图" onClick={() => setZoom(z => Math.max(.25, z-.1))}><ZoomOut size={16}/></button><span>{Math.round(zoom*100)}%</span><button title="放大" aria-label="放大架构图" onClick={() => setZoom(z => Math.min(1.8,z+.1))}><ZoomIn size={16}/></button><i/><button aria-label="适应整张架构图" title="适应整张架构图" onClick={fit}><Focus size={17}/></button><button aria-label="恢复百分之百" title="恢复 100%" onClick={() => setZoom(1)}><Maximize2 size={16}/></button></div></div>
  </section>;
}
