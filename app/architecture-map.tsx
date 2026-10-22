"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Ellipsis, Focus, GitBranch, Lightbulb, Maximize2, Minus, Pencil, PenLine, Plus, SlidersHorizontal, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { statusLabels, type Question, type StudyData, type StudyGroup, type StudyNodeKind, type StudyNodeTarget, type Topic } from "@/lib/study";
import { CANVAS_WHEEL_MODE_KEY, CanvasTouchGesture, clampCanvasZoom, resolveCanvasWheel, type CanvasWheelMode } from "@/lib/canvas-gestures";
import MemoryKeywords from "./memory-keywords";

type Props = {
  data: StudyData; activeTopic: string; activeQuestion: string; focusMode: boolean;
  addGroup: () => void;
  deleteNode: (target: { kind: StudyNodeKind | "answer"; id: string; title: string }) => void;
  moveNode: (target: StudyNodeTarget, direction: -1 | 1) => void;
  editGroup: (group: StudyGroup) => void; addTopic: (group: StudyGroup) => void;
  editTopic: (group: StudyGroup, topic: Topic) => void;
  addQuestion: (topic: Topic) => void; editQuestion: (group: StudyGroup, topic: Topic, question: Question) => void; openQuestion: (group: StudyGroup, topic: Topic, question: Question) => void;
  practiceTopic: (topic: Topic) => void; practiceQuestion: (topic: Topic, question: Question) => void;
};
const themes = ["sage", "blue", "amber", "rose", "violet"];
type MapNode = { key: string; x: number; y: number; width: number; height: number; type: "root" | "group" | "topic" | "question" | "answer"; group?: StudyGroup; topic?: Topic; question?: Question; index: number; theme: string };

export default function ArchitectureMap(props: Props) {
  const { data } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Set<string>>(new Set());
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [actionsNodeKey, setActionsNodeKey] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 0.8 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<HTMLDivElement>(null);
  const [nodeHeights, setNodeHeights] = useState<Record<string, number>>({});
  const [wheelMode, setWheelMode] = useState<CanvasWheelMode>("pan");
  const wheelModeRef = useRef<CanvasWheelMode>("pan");
  const cameraRef = useRef(camera);
  const autoFit = useRef(true);
  const previousSize = useRef({ width: 0, height: 0 });
  const pan = useRef<{ pointerId: number; x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const touch = useRef(new CanvasTouchGesture());
  const lastPointerType = useRef("");
  const zoom = camera.zoom;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CANVAS_WHEEL_MODE_KEY);
      if (stored === "pan" || stored === "zoom") { wheelModeRef.current = stored; setWheelMode(stored); }
    } catch { /* The default still works when preferences cannot be saved. */ }
  }, []);
  function switchWheelMode() {
    const next = wheelModeRef.current === "pan" ? "zoom" : "pan";
    wheelModeRef.current = next;
    setWheelMode(next);
    try { localStorage.setItem(CANVAS_WHEEL_MODE_KEY, next); } catch { /* Keep the current-session choice. */ }
  }

  function moveCamera(next: typeof camera) {
    cameraRef.current = next;
    setCamera(next);
  }

  function zoomAt(nextZoom: number, point?: { x: number; y: number }) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const current = cameraRef.current;
    const next = clampCanvasZoom(nextZoom);
    const anchor = point ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    const ratio = next / current.zoom;
    autoFit.current = false;
    moveCamera({ x: anchor.x - (anchor.x - current.x) * ratio, y: anchor.y - (anchor.y - current.y) * ratio, zoom: next });
  }

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function wheel(event: WheelEvent) {
      if (!viewport || (!event.deltaX && !event.deltaY)) return;
      event.preventDefault();
      const action = resolveCanvasWheel(event, wheelModeRef.current, { width: viewport.clientWidth, height: viewport.clientHeight });
      if (action.kind === "pan") {
        autoFit.current = false;
        const current = cameraRef.current;
        moveCamera({ ...current, x: current.x - action.dx, y: current.y - action.dy });
        return;
      }
      const rect = viewport.getBoundingClientRect();
      zoomAt(cameraRef.current.zoom * action.factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    viewport.addEventListener("wheel", wheel, { passive: false });
    return () => viewport.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const cancelGestures = () => {
      const viewport = viewportRef.current;
      const ids = [...touch.current.pointerIds, ...(pan.current ? [pan.current.pointerId] : [])];
      touch.current.clear();
      pan.current = null;
      viewport?.classList.remove("panning");
      for (const id of ids) if (viewport?.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    };
    window.addEventListener("blur", cancelGestures);
    return () => { window.removeEventListener("blur", cancelGestures); cancelGestures(); };
  }, []);
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
          const questionHeight = nodeHeights[question.id] ?? 84;
          const answerHeight = nodeHeights[`answer-${question.id}`] ?? 92;
          const rowHeight = Math.max(questionHeight + 16, answers.has(question.id) ? answerHeight + 16 : 100);
          const questionNode: MapNode = { key: question.id, x: 744, y: cursor + (rowHeight - questionHeight) / 2, width: 230, height: questionHeight, type: "question", group, topic, question, index: qi, theme };
          if (answers.has(question.id)) {
            const answerNode: MapNode = { ...questionNode, key: `answer-${question.id}`, x: 1040, y: cursor + (rowHeight - answerHeight) / 2, width: 340, height: answerHeight, type: "answer" };
            nodes.push(answerNode); lines.push({ from: questionNode, to: answerNode, color: theme });
            contentWidth = 1420;
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

  const selectedNode = nodes.find(node => node.key === selectedNodeKey);
  const showActions = !!selectedNode && actionsNodeKey === selectedNodeKey;
  const movableNode = selectedNode && (selectedNode.type === "group" || selectedNode.type === "topic" || selectedNode.type === "question") ? selectedNode : undefined;
  const siblings = movableNode?.type === "group" ? data.groups : movableNode?.type === "topic" ? movableNode.group!.topics : movableNode?.topic?.questions ?? [];
  const siblingIndex = siblings.findIndex(node => node.id === movableNode?.key);
  function moveSelected(direction: -1 | 1) {
    if (movableNode) props.moveNode({ kind: movableNode.type as StudyNodeKind, id: movableNode.key }, direction);
  }
  function deleteSelected() {
    if (!selectedNode || selectedNode.type === "root") return;
    props.deleteNode({ kind: selectedNode.type, id: selectedNode.question?.id ?? selectedNode.key, title: selectedNode.question?.title ?? selectedNode.topic?.title ?? selectedNode.group!.title });
  }
  const visibleMeasuredKeys = nodes.filter(node => node.type === "question" || node.type === "answer").map(node => node.key).join("\n");
  useLayoutEffect(() => {
    const elements = drawingRef.current?.querySelectorAll<HTMLElement>("[data-measure-key]");
    if (!elements?.length) return;
    function measure() {
      const measured: Record<string, number> = {};
      elements?.forEach(element => { measured[element.dataset.measureKey!] = element.offsetHeight; });
      setNodeHeights(current => Object.entries(measured).some(([id, measuredHeight]) => current[id] !== measuredHeight) ? { ...current, ...measured } : current);
    }
    // Intrinsic heights keep the layout aligned after edits, font changes, and zooming.
    const observer = new ResizeObserver(measure);
    elements.forEach(element => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [visibleMeasuredKeys]);

  function fit() {
    const element = viewportRef.current;
    if (!element || !element.clientWidth || !element.clientHeight) return;
    const topInset = props.focusMode ? 56 : 76, bottomInset = 72;
    const availableHeight = Math.max(80, element.clientHeight - topInset - bottomInset);
    const nextZoom = Math.max(0.1, Math.min(1.05, (element.clientWidth - 48) / contentWidth, availableHeight / height));
    autoFit.current = true;
    moveCamera({ x: (element.clientWidth - contentWidth * nextZoom) / 2, y: topInset + (availableHeight - height * nextZoom) / 2, zoom: nextZoom });
  }

  useLayoutEffect(() => {
    const last = previousSize.current;
    if (viewportSize.width && viewportSize.height) {
      if (autoFit.current) fit();
      else if (last.width && last.height && (last.width !== viewportSize.width || last.height !== viewportSize.height)) {
        const current = cameraRef.current;
        moveCamera({ ...current, x: current.x + (viewportSize.width - last.width) / 2, y: current.y + (viewportSize.height - last.height) / 2 });
      }
    }
    previousSize.current = viewportSize;
  }, [viewportSize.width, viewportSize.height, contentWidth, height, props.focusMode]);

  useEffect(() => { if (!props.activeTopic) return; setExpanded(old => new Set([...old, props.activeTopic])); const group = data.groups.find(g => g.topics.some(t => t.id === props.activeTopic)); if (group) setCollapsed(old => { const next = new Set(old); next.delete(group.id); return next; }); }, [props.activeTopic, props.activeQuestion]);
  useEffect(() => { if (props.activeQuestion) { setSelectedNodeKey(props.activeQuestion); setActionsNodeKey(null); } }, [props.activeQuestion]);
  useLayoutEffect(() => { setActionsNodeKey(null); }, [props.focusMode]);
  function toggle(setter: typeof setExpanded, id: string) { setter(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    lastPointerType.current = event.pointerType;
    if (event.pointerType === "touch") {
      const rect = viewport.getBoundingClientRect();
      touch.current.start(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top }, cameraRef.current);
      if (touch.current.pointerIds.length > 1) {
        event.preventDefault();
        autoFit.current = false;
        for (const id of touch.current.pointerIds) viewport.setPointerCapture(id);
        viewport.classList.add("panning");
      }
      // Preserve a normal tap on a node. Capture only after a drag/pinch starts.
      return;
    }
    if (!event.isPrimary || pan.current || (event.button !== 0 && event.button !== 1)) return;
    if (event.button === 0 && (event.target as Element).closest("button,input,a,summary")) return;
    event.preventDefault();
    const current = cameraRef.current;
    autoFit.current = false;
    pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cameraX: current.x, cameraY: current.y };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("panning");
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (event.pointerType === "touch" && viewport) {
      const rect = viewport.getBoundingClientRect();
      const next = touch.current.move(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top });
      if (next) {
        event.preventDefault();
        autoFit.current = false;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("panning");
        moveCamera(next);
      }
      return;
    }
    const start = pan.current;
    if (!start || start.pointerId !== event.pointerId) return;
    moveCamera({ ...cameraRef.current, x: start.cameraX + event.clientX - start.x, y: start.cameraY + event.clientY - start.y });
  }
  function endPan(event: PointerEvent<HTMLDivElement>) {
    if (touch.current.has(event.pointerId)) {
      touch.current.end(event.pointerId, cameraRef.current);
      const viewport = viewportRef.current;
      if (!touch.current.pointerIds.length) viewport?.classList.remove("panning");
      if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      return;
    }
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    const viewport = viewportRef.current;
    viewport?.classList.remove("panning");
    if (viewport?.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  }

  return <section className="architecture-board" aria-label="中国近现代史知识架构图">
    <div className="graph-viewport" ref={viewportRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={event => { if (event.target === event.currentTarget) endPan(event); }} onClickCapture={event => { if (lastPointerType.current === "touch" && touch.current.didMove && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }} style={{ backgroundPosition: `${camera.x}px ${camera.y}px` }}>
      <div className="graph-space"><div ref={drawingRef} className="graph-drawing" style={{ width: contentWidth, height, transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${zoom})`, "--node-font": `${Math.min(21, 14 / zoom)}px`, "--control-scale": 1 / zoom } as CSSProperties}>
        <svg width={contentWidth} height={height} className="graph-lines" aria-hidden="true">{lines.map(({ from, to, color }) => { const x1 = from.x + from.width, y1 = from.y + from.height / 2, x2 = to.x, y2 = to.y + to.height / 2; return <path key={`${from.key}-${to.key}`} className={`theme-${color}`} d={`M ${x1} ${y1} C ${x1 + (x2-x1)/2} ${y1}, ${x2 - (x2-x1)/2} ${y2}, ${x2} ${y2}`} />; })}</svg>
        {nodes.map(node => <div key={node.key} data-measure-key={node.type === "question" || node.type === "answer" ? node.key : undefined} onClickCapture={() => { setSelectedNodeKey(node.key); setActionsNodeKey(null); }} onContextMenu={event => { event.preventDefault(); setSelectedNodeKey(node.key); setActionsNodeKey(node.key); }} className={`graph-node graph-${node.type} theme-${node.theme} ${selectedNodeKey === node.key ? "selected" : ""}`} style={{ left: node.x, top: node.y, width: node.width, height: node.type === "question" || node.type === "answer" ? "auto" : node.height }}>
          {node.type === "root" && <button className="graph-node-main" aria-pressed={selectedNodeKey === node.key}><GitBranch size={23}/><strong>中国近现代史</strong><span>知识架构与论述题</span></button>}
          {node.type === "group" && node.group && <><button className="graph-node-main" aria-pressed={selectedNodeKey === node.key}><span className="graph-group-label"><b>{String(node.index + 1).padStart(2,"0")}</b>{node.group.title}</span><strong>{node.group.subtitle}</strong></button><button className="graph-branch-toggle" aria-label={`${collapsed.has(node.group.id) ? "展开" : "收起"}${node.group.title}`} aria-expanded={!collapsed.has(node.group.id)} onClick={() => toggle(setCollapsed,node.group!.id)}>{collapsed.has(node.group.id) ? <Plus size={11}/> : <Minus size={11}/>}</button></>}
          {node.type === "topic" && node.topic && <><button className="graph-node-main" aria-pressed={selectedNodeKey === node.key}><strong>{node.topic.title}</strong><span className="graph-topic-count">{node.topic.questions.length} 题</span></button>{node.topic.questions.length > 0 && <button className="graph-branch-toggle" aria-label={`${expanded.has(node.topic.id) ? "收起" : "展开"}${node.topic.title}题目`} aria-expanded={expanded.has(node.topic.id)} onClick={() => toggle(setExpanded,node.topic!.id)}>{expanded.has(node.topic.id) ? <Minus size={11}/> : <Plus size={11}/>}</button>}</>}
          {node.type === "question" && node.question && <><button className="graph-node-main" aria-pressed={selectedNodeKey === node.key}><span className="graph-question-number">{node.index + 1}.</span><strong>{node.question.title}</strong><span className={`status-dot status-${node.question.status}`} title={statusLabels[node.question.status]}/></button><button className="graph-branch-toggle" aria-label={`${answers.has(node.question.id) ? "收起" : "展开"}答案与关键词`} aria-expanded={answers.has(node.question.id)} onClick={() => toggle(setAnswers,node.question!.id)}>{answers.has(node.question.id) ? <Minus size={11}/> : <Plus size={11}/>}</button></>}
          {node.type === "answer" && node.question && <>
            <details className="graph-reference" onToggle={() => { autoFit.current = false; }}><summary onClick={() => { autoFit.current = false; }}><BookOpen size={15}/>标准答案原文<ChevronDown size={15}/></summary><div className="graph-reference-body"><div className="graph-reference-text">{node.question.answer || "尚未录入标准答案原文。"}</div><button className="text-button" onClick={() => props.editQuestion(node.group!,node.topic!,node.question!)}><Pencil size={13}/>编辑原文</button></div></details>
            <details className="graph-reference" onToggle={() => { autoFit.current = false; }}><summary onClick={() => { autoFit.current = false; }}><Lightbulb size={15}/>记忆关键词<ChevronDown size={15}/></summary><div className="graph-reference-body">{node.question.keywords.length ? <MemoryKeywords keywords={node.question.keywords}/> : <p>尚未录入记忆关键词。</p>}<button className="text-button" onClick={() => props.editQuestion(node.group!,node.topic!,node.question!)}><Pencil size={13}/>编辑关键词</button></div></details>
          </>}
        </div>)}
      </div></div>
    </div>
      {showActions && selectedNode && <div className={`canvas-actions theme-${selectedNode.theme}`} role="toolbar" aria-label="节点操作" onPointerDown={event => event.stopPropagation()}>
        <div className="canvas-actions-heading"><span title={selectedNode.question?.title ?? selectedNode.topic?.title ?? selectedNode.group?.title}>{selectedNode.type === "root" ? "总框架 · 分组管理" : selectedNode.question ? `${selectedNode.topic?.title} · ${selectedNode.type === "answer" ? "答案操作" : "题目操作"}` : selectedNode.topic ? `${selectedNode.topic.title} · 专题操作` : `${selectedNode.group?.title} · 分组操作`}</span><button className="icon-button" aria-label="关闭节点操作" onClick={() => setActionsNodeKey(null)}><X size={18}/></button></div>
        <div className="canvas-action-buttons">
          {selectedNode.type === "root" && <button className="button primary" onClick={props.addGroup} disabled={data.groups.length >= 50}><Plus size={18}/>新增分组</button>}
          {selectedNode.type === "group" && <><button className="button primary" onClick={() => props.addTopic(selectedNode.group!)}><Plus size={18}/>新增专题</button><button className="button secondary" onClick={() => props.editGroup(selectedNode.group!)}><Pencil size={17}/>编辑分组</button></>}
          {selectedNode.type === "topic" && <><button className="button primary" onClick={() => props.addQuestion(selectedNode.topic!)}><Plus size={18}/>新增题目</button><button className="button secondary" onClick={() => props.editTopic(selectedNode.group!,selectedNode.topic!)}><Pencil size={17}/>编辑专题</button><button className="button secondary" onClick={() => props.practiceTopic(selectedNode.topic!)}><PenLine size={17}/>默写题目</button></>}
          {(selectedNode.type === "question" || selectedNode.type === "answer") && <><button className="button primary" onClick={() => props.editQuestion(selectedNode.group!,selectedNode.topic!,selectedNode.question!)}><Pencil size={17}/>{selectedNode.type === "answer" ? "编辑答案" : "编辑题目与答案"}</button><button className="button secondary" onClick={() => props.practiceQuestion(selectedNode.topic!,selectedNode.question!)}><PenLine size={17}/>默写答案</button><button className="button secondary" onClick={() => props.openQuestion(selectedNode.group!,selectedNode.topic!,selectedNode.question!)}><BookOpen size={17}/>查看答案</button></>}
          {movableNode && <><button className="button secondary" onClick={() => moveSelected(-1)} disabled={siblingIndex <= 0} title="在同一父节点下上移"><ArrowUp size={17}/>上移</button><button className="button secondary" onClick={() => moveSelected(1)} disabled={siblingIndex < 0 || siblingIndex >= siblings.length - 1} title="在同一父节点下下移"><ArrowDown size={17}/>下移</button><button className="button secondary danger" onClick={deleteSelected} disabled={movableNode.type === "group" && data.groups.length === 1} title={movableNode.type === "group" && data.groups.length === 1 ? "至少保留一个分组" : "删除此节点及其子节点"}><Trash2 size={17}/>删除节点</button></>}
          {selectedNode.type === "answer" && <button className="button secondary danger" onClick={deleteSelected} disabled={!selectedNode.question?.answer}><Trash2 size={17}/>清空答案</button>}
        </div>
      </div>}
    <div className="graph-bottom"><div className="graph-zoom" role="toolbar" aria-label="画布工具">
      <details className="graph-tools"><summary aria-label="图谱工具" title="节点操作、展开收起题目、操作说明"><SlidersHorizontal size={17}/><span>图谱工具</span></summary><div className="graph-tools-panel"><strong>图谱工具</strong><button disabled={!selectedNode} onClick={event => { if (selectedNode) setActionsNodeKey(selectedNode.key); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Ellipsis size={17}/>节点操作</button><button onClick={event => { setActionsNodeKey(null); setCollapsed(new Set()); setExpanded(new Set(data.groups.flatMap(g => g.topics.map(t => t.id)))); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Plus size={16}/>展开全部题目</button><button onClick={event => { setActionsNodeKey(null); setCollapsed(new Set()); setExpanded(new Set()); setAnswers(new Set()); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Minus size={16}/>收起全部题目</button><p>点击节点只选中，＋/－ 展开收起。需要新增、编辑、排序或删除时，选择“节点操作”。</p><p className="graph-guide-desktop">也可右键节点打开操作。按住空白处拖动；双指滑动移动；捏合或 Option＋滚动缩放。</p><p className="graph-guide-touch">单指拖动，双指捏合缩放。</p></div></details>
      <button className="graph-scroll-mode" aria-label={wheelMode === "pan" ? "切换为滚动缩放" : "切换为滚动移动"} aria-pressed={wheelMode === "zoom"} title="默认滚动移动画布，捏合或 Option＋滚动缩放；点击切换滚动模式" onClick={switchWheelMode}>滚动：{wheelMode === "pan" ? "移动" : "缩放"}</button><i/><button title="缩小" aria-label="缩小架构图" onClick={() => zoomAt(cameraRef.current.zoom - .1)}><ZoomOut size={18}/></button><span>{Math.round(zoom*100)}%</span><button title="放大" aria-label="放大架构图" onClick={() => zoomAt(cameraRef.current.zoom + .1)}><ZoomIn size={18}/></button><i/><button aria-label="适应整张架构图" title="适应整张架构图" onClick={fit}><Focus size={19}/></button><button aria-label="恢复百分之百" title="恢复 100%" onClick={() => zoomAt(1)}><Maximize2 size={18}/></button>
    </div></div>
  </section>;
}
