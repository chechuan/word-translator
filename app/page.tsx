"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, Circle, GitBranch, Lightbulb, Network, Pencil, PenLine, Search, Trash2, Upload, X } from "lucide-react";
import ArchitectureMap from "./architecture-map";
import { getQuestions, makeInitialData, parseMemoryKeywords, parseStudyData, removeUnusedExample, searchQuestions, statusLabels, STORAGE_KEY, type Question, type StudyData, type StudyGroup, type StudyStatus, type Topic } from "@/lib/study";

type Editor = { kind: "question"; topicId: string; question?: Question } | { kind: "topic"; groupId: string; topic?: Topic } | { kind: "group"; group: StudyGroup };
type Practice = { kind: "questions" | "answer"; topicId: string; questionId?: string };
const colors = ["sage", "blue", "amber", "rose", "violet"];

function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} aria-label={title} onCancel={event => { event.preventDefault(); close(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}

function MemoryKeywords({ keywords }: { keywords: string[] }) {
  return <ol className="memory-keywords" aria-label="记忆关键词">{parseMemoryKeywords(keywords.join("\n")).map((word, index) => <li key={index}><span>（{index + 1}）</span><span>{word}</span></li>)}</ol>;
}

function EditorModal({ editor, save, close }: { editor: Editor; save: (values: { title: string; answer: string; keywords: string[]; subtitle: string; period: string }) => void; close: () => void }) {
  const item = editor.kind === "question" ? editor.question : editor.kind === "topic" ? editor.topic : editor.group;
  const [title, setTitle] = useState(item?.title ?? "");
  const [answer, setAnswer] = useState(editor.kind === "question" ? editor.question?.answer ?? "" : "");
  const [keywords, setKeywords] = useState(editor.kind === "question" ? parseMemoryKeywords(editor.question?.keywords.join("\n") ?? "").map((word, index) => `（${index + 1}）${word}`).join("\n") : "");
  const [subtitle, setSubtitle] = useState(editor.kind === "group" ? editor.group.subtitle : "");
  const [formError, setFormError] = useState("");
  const [period, setPeriod] = useState(editor.kind === "group" ? editor.group.period : "");
  const name = editor.kind === "question" ? "论述题" : editor.kind === "topic" ? "专题" : "分组";
  return <Modal title={`${item ? "编辑" : "新增"}${name}`} close={close} wide={editor.kind === "question"}>
    <form onSubmit={event => { event.preventDefault(); const words = parseMemoryKeywords(keywords); if (words.length > 100 || words.some(word => word.length > 100)) { setFormError("记忆关键词最多 100 条，每条不超过 100 字。"); return; } if (title.trim()) save({ title: title.trim(), answer: answer.trim(), keywords: words, subtitle: subtitle.trim(), period: period.trim() }); }}>
      <label className="field-label">{name}名称<input autoFocus required maxLength={editor.kind === "question" ? 500 : 100} value={title} onChange={event => setTitle(event.target.value)} /></label>
      {editor.kind === "question" && <><label className="field-label">标准答案 <span>可以稍后补充</span><textarea rows={9} maxLength={100000} value={answer} onChange={event => setAnswer(event.target.value)} /></label><label className="field-label">记忆关键词 <span>按（1）（2）（3）分条填写，每条一行</span><textarea rows={4} maxLength={12000} value={keywords} onChange={event => setKeywords(event.target.value)} /></label></>}
      {editor.kind === "group" && <><label className="field-label">分组说明<input maxLength={200} value={subtitle} onChange={event => setSubtitle(event.target.value)} /></label><label className="field-label">时间或备注<input maxLength={100} value={period} onChange={event => setPeriod(event.target.value)} /></label></>}
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <div className="modal-footer"><button type="button" className="button secondary" onClick={close}>取消</button><button className="button primary" type="submit" disabled={!title.trim()}><Check size={16} />保存{name}</button></div>
    </form>
  </Modal>;
}

function downloadData(data: StudyData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `研途笔记题库-${new Date().toLocaleDateString("sv-SE")}.json`; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [topicTools, setTopicTools] = useState<{group: StudyGroup; topic: Topic} | null>(null);
  const [data, setData] = useState<StudyData>(makeInitialData);
  const [loaded, setLoaded] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeGroup, setActiveGroup] = useState("group-1");
  const [activeTopic, setActiveTopic] = useState("");
  const [activeQuestion, setActiveQuestion] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [reveal, setReveal] = useState(false);
  const [hint, setHint] = useState(false);
  const [incoming, setIncoming] = useState<StudyData | null>(null);
  const [deletion, setDeletion] = useState<{ kind: "topic" | "question"; id: string; title: string } | null>(null);
  const [toast, setToast] = useState("");
  const [undoData, setUndoData] = useState<StudyData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) setData(removeUnusedExample(parseStudyData(raw))); }
    catch { setSaveBlocked(true); setSaveError("本地题库读取失败，原数据已保留。请先检查浏览器存储，或导入已有备份恢复。"); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || saveBlocked) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setSaveError(""); }
    catch { setSaveError("浏览器未能保存，可能是存储空间不足。请立即导出题库备份。"); }
  }, [data, loaded, saveBlocked]);
  useEffect(() => { if (!toast || undoData) return; const timer = window.setTimeout(() => setToast(""), 4200); return () => clearTimeout(timer); }, [toast, undoData]);
  useEffect(() => { setReveal(false); setHint(false); }, [practice?.kind, practice?.topicId, practice?.questionId]);

  const group = data.groups.find(item => item.id === activeGroup) ?? data.groups[0];
  const topic = group.topics.find(item => item.id === activeTopic) ?? group.topics[0];
  const question = topic?.questions.find(item => item.id === activeQuestion) ?? topic?.questions[0];
  const all = getQuestions(data);
  const theme = colors[data.groups.indexOf(group) % colors.length];
  const searchResults = query.trim() ? searchQuestions(data, query) : [];

  function mutate(change: (old: StudyData) => StudyData) {
    setUndoData(null); setToast("");
    setData(old => ({ ...change(old), updatedAt: new Date().toISOString() }));
  }
  function notify(message: string) { setUndoData(null); setToast(message); }
  function selectQuestion(t: Topic, q: Question, g = group) { setActiveGroup(g.id); setActiveTopic(t.id); setActiveQuestion(q.id); setQuery(""); }
  function setStatus(id: string, status: StudyStatus) { mutate(old => ({ ...old, groups: old.groups.map(g => ({ ...g, topics: g.topics.map(t => ({ ...t, questions: t.questions.map(q => q.id === id ? { ...q, status } : q) })) })) })); }
  function saveEditor(values: { title: string; answer: string; keywords: string[]; subtitle: string; period: string }) {
    if (!editor) return;
    const id = crypto.randomUUID();
    if (editor.kind === "group") mutate(old => ({ ...old, groups: old.groups.map(g => g.id === editor.group.id ? { ...g, title: values.title, subtitle: values.subtitle, period: values.period } : g) }));
    if (editor.kind === "topic") {
      mutate(old => ({ ...old, groups: old.groups.map(g => g.id === editor.groupId ? { ...g, topics: editor.topic ? g.topics.map(t => t.id === editor.topic?.id ? { ...t, title: values.title } : t) : [...g.topics, { id, title: values.title, questions: [] }] } : g) }));
      setActiveTopic(editor.topic?.id ?? id); setActiveQuestion("");
    }
    if (editor.kind === "question") {
      const next: Question = { id: editor.question?.id ?? id, title: values.title, answer: values.answer, keywords: values.keywords, status: editor.question?.status ?? "new" };
      mutate(old => ({ ...old, groups: old.groups.map(g => ({ ...g, topics: g.topics.map(t => t.id === editor.topicId ? { ...t, questions: editor.question ? t.questions.map(q => q.id === next.id ? next : q) : [...t.questions, next] } : t) })) }));
      setActiveTopic(editor.topicId); setActiveQuestion(next.id);
    }
    setEditor(null); notify("已保存");
  }
  function removeItem() {
    if (!deletion) return;
    const previous = data;
    const ids = new Set<string>([deletion.id]);
    if (deletion.kind === "topic") all.filter(item => item.topic.id === deletion.id).forEach(item => ids.add(item.question.id));
    const drafts = Object.fromEntries(Object.entries(data.drafts).filter(([key]) => !ids.has(key.slice(key.indexOf(":") + 1))));
    setData({ ...data, drafts, updatedAt: new Date().toISOString(), groups: data.groups.map(g => ({ ...g, topics: g.topics.filter(t => deletion.kind !== "topic" || t.id !== deletion.id).map(t => ({ ...t, questions: t.questions.filter(q => deletion.kind !== "question" || q.id !== deletion.id) })) })) });
    setUndoData(previous); setToast(`已删除“${deletion.title}”`); setDeletion(null);
  }
  function beginPractice(kind: Practice["kind"]) {
    if (!topic) { notify("先添加一个专题，再开始默写。"); return; }
    if (kind === "answer" && !question) { notify("先添加一道论述题，再开始默写答案。"); return; }
    setPractice({ kind, topicId: topic.id, questionId: question?.id });
  }
  const practiceEntry = practice ? all.find(item => item.question.id === practice.questionId) : undefined;
  const practiceTopic = practice ? data.groups.flatMap(g => g.topics).find(t => t.id === practice.topicId) : undefined;
  const practiceKey = practice?.kind === "questions" ? `topic:${practice.topicId}` : `answer:${practice?.questionId}`;
  const practiceText = data.drafts[practiceKey] ?? "";
  const practiceIndex = practiceEntry ? all.findIndex(item => item.question.id === practiceEntry.question.id) : -1;
  function nextPractice(index: number) { const item = all[index]; if (item) setPractice({ kind: "answer", topicId: item.topic.id, questionId: item.question.id }); }

  return <div className={`graph-app theme-${theme}`}>
    <header className="graph-header"><a href="/" className="graph-brand"><span><GitBranch size={21}/></span><strong>研途笔记</strong><small>考研资料整理</small></a><div className="graph-header-right"><label className="graph-search"><Search size={15}/><input aria-label="搜索全部题目" placeholder="搜索题目…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <button aria-label="清空搜索" onClick={() => setQuery("")}><X size={14}/></button>}</label><button className="button small secondary" aria-label="导出题库" onClick={() => downloadData(data)}><ArrowDownToLine size={15}/><span>导出</span></button><button className="button small secondary" aria-label="导入题库" onClick={() => fileRef.current?.click()}><Upload size={15}/><span>导入</span></button></div></header>
    <div className="graph-intro"><span><strong>考研资料</strong><span> / </span>{data.groups.length} 组 · {data.groups.reduce((sum,g) => sum + g.topics.length,0)} 个专题 · {all.length} 道论述题</span><span className={`save-status ${saveError ? "save-error" : ""}`}><span/>{loaded ? saveError ? "保存异常" : "已保存在此浏览器" : "正在读取题库"}</span></div>
    <input hidden ref={fileRef} type="file" accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { if (file.size > 10_000_000) throw new Error("题库文件过大，请控制在 10 MB 以内。"); setIncoming(parseStudyData(await file.text())); } catch (error) { notify(error instanceof Error ? error.message : "导入失败，请重试。"); } }}/>
    {saveError && <div className="storage-error" role="alert">{saveError}<button onClick={() => downloadData(data)}>导出当前内容</button></div>}
    {query.trim() && <div className="graph-search-results"><div>搜索结果 · {searchResults.length} 道题</div>{searchResults.map(item => <button key={item.question.id} onClick={() => { selectQuestion(item.topic,item.question,item.group); setDetailOpen(true); }}><span><small>{item.group.title} / {item.topic.title}</small><strong>{item.question.title}</strong></span><ChevronRight size={15}/></button>)}{!searchResults.length && <p>没有找到题目，可选中专题后点击“新增题目”。</p>}</div>}
    <ArchitectureMap data={data} activeTopic={activeTopic} activeQuestion={activeQuestion}
      editGroup={g => setEditor({kind:"group",group:g})}
      addTopic={g => { setActiveGroup(g.id); setEditor({kind:"topic",groupId:g.id}); }}
      editTopic={(g,t) => { setActiveGroup(g.id); setActiveTopic(t.id); setTopicTools({group:g,topic:t}); }}
      addQuestion={t => { const g = data.groups.find(item => item.topics.some(item => item.id === t.id)); if (g) setActiveGroup(g.id); setActiveTopic(t.id); setEditor({kind:"question",topicId:t.id}); }}
      editQuestion={(g,t,q) => { selectQuestion(t,q,g); setEditor({kind:"question",topicId:t.id,question:q}); }}
      openQuestion={(g,t,q) => { selectQuestion(t,q,g); setDetailOpen(true); }}
      practiceTopic={t => setPractice({kind:"questions",topicId:t.id})}
      practiceQuestion={(t,q) => setPractice({kind:"answer",topicId:t.id,questionId:q.id})}
    />
    {topicTools && <Modal title="编辑专题" close={() => setTopicTools(null)}><div className="topic-tools-title">{topicTools.group.title} / {topicTools.topic.title}</div><div className="topic-tools-buttons"><button className="button secondary" onClick={() => { setEditor({kind:"topic",groupId:topicTools.group.id,topic:topicTools.topic}); setTopicTools(null); }}><Pencil size={15}/>修改名称</button><button className="button secondary danger" onClick={() => { setDeletion({kind:"topic",id:topicTools.topic.id,title:topicTools.topic.title}); setTopicTools(null); }}><Trash2 size={15}/>删除专题</button></div></Modal>}
    {detailOpen && question && topic && <Modal title={question.title} close={() => setDetailOpen(false)} wide><div className="detail-dialog-path">{group.title} / {topic.title}</div><div className="answer-heading"><h4>标准答案</h4><label className="status-select"><span className={`status-dot status-${question.status}`}/><select aria-label="掌握程度" value={question.status} onChange={event => setStatus(question.id,event.target.value as StudyStatus)}>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={12}/></label></div><div className="detail-dialog-answer">{question.answer || "还没有标准答案，点击下方“编辑题目与答案”来录入。"}</div>{question.keywords.length > 0 && <section className="memory-keywords-section"><h4>记忆关键词</h4><MemoryKeywords keywords={question.keywords}/></section>}<div className="detail-dialog-actions"><button className="button secondary" onClick={() => { setDetailOpen(false); setEditor({kind:"question",topicId:topic.id,question}); }}><Pencil size={15}/>编辑题目与答案</button><button className="button primary" onClick={() => { setDetailOpen(false); beginPractice("answer"); }}><PenLine size={15}/>默写这道题</button><button className="icon-button danger" aria-label="删除当前题目" onClick={() => { setDetailOpen(false); setDeletion({kind:"question",id:question.id,title:question.title}); }}><Trash2 size={15}/></button></div></Modal>}

    {editor && <EditorModal editor={editor} close={() => setEditor(null)} save={saveEditor} />}
    {practice && practiceTopic && <Modal title="默写练习" close={() => setPractice(null)} wide><div className="practice-mode-tabs"><button className={practice.kind === "questions" ? "active" : ""} onClick={() => setPractice({ ...practice, kind: "questions" })}><Network size={15} />默写题目</button><button className={practice.kind === "answer" ? "active" : ""} disabled={!practiceTopic.questions.length} onClick={() => setPractice({ kind: "answer", topicId: practiceTopic.id, questionId: practiceEntry?.question.id ?? practiceTopic.questions[0]?.id })}><PenLine size={15} />默写答案</button></div><div className="practice-prompt"><span>{practice.kind === "questions" ? "根据专题，回想它下面的所有论述题" : `${practiceTopic.title} · 先回忆，再对照`}</span><h3>{practice.kind === "questions" ? practiceTopic.title : practiceEntry?.question.title}</h3></div><label className="field-label practice-writing-label">我的默写<textarea autoFocus className="practice-writing" aria-label="我的默写内容" rows={8} value={practiceText} maxLength={100000} onChange={event => { const value = event.target.value; mutate(old => ({ ...old, drafts: { ...old.drafts, [practiceKey]: value } })); }} /></label><div className="practice-tools"><span>{practiceText.length} 字 · 草稿自动保存{saveError ? "异常" : ""}</span><div>{practice.kind === "answer" && <button className="text-button" onClick={() => setHint(!hint)}><Lightbulb size={14} />{hint ? "收起记忆关键词" : "显示记忆关键词"}</button>}<button className="button small secondary" onClick={() => setReveal(!reveal)}><BookOpen size={15} />{reveal ? "收起对照" : "展开对照"}</button></div></div>{hint && practice.kind === "answer" && <div className="hint-box">{practiceEntry?.question.keywords.length ? <MemoryKeywords keywords={practiceEntry.question.keywords}/> : "还没有记忆关键词，可在编辑题目时填写。"}</div>}{reveal && <div className="comparison"><h4>{practice.kind === "questions" ? "这个专题的题目" : "标准答案"}<span>自行对照，补上遗漏</span></h4>{practice.kind === "questions" ? practiceTopic.questions.length ? <ol>{practiceTopic.questions.map(q => <li key={q.id}>{q.title}</li>)}</ol> : <p>这个专题还没有题目。先添加题目，再练习回忆。</p> : <div className="answer-text">{practiceEntry?.question.answer || "还没有录入标准答案。你可以先保存默写草稿，稍后补充答案再对照。"}</div>}</div>}{reveal && practice.kind === "answer" && practiceEntry && <div className="self-assessment"><span>这次记得怎么样？</span><div>{(["new", "review", "mastered"] as StudyStatus[]).map(status => <button key={status} className={practiceEntry.question.status === status ? "active" : ""} onClick={() => setStatus(practiceEntry.question.id, status)}>{status === "mastered" ? <CheckCheck size={14} /> : <Circle size={12} />}{status === "new" ? "还没记住" : statusLabels[status]}</button>)}</div></div>}<div className="modal-footer practice-footer"><button className="button secondary" onClick={() => setPractice(null)}><Check size={15} />完成并退出</button>{practice.kind === "answer" && <div><button className="icon-button" aria-label="上一题" disabled={practiceIndex <= 0} onClick={() => nextPractice(practiceIndex - 1)}><ArrowLeft size={17} /></button><span>{practiceIndex + 1} / {all.length}</span><button className="button primary small" disabled={practiceIndex >= all.length - 1} onClick={() => nextPractice(practiceIndex + 1)}>下一题<ArrowRight size={15} /></button></div>}</div></Modal>}
    {incoming && <Modal title="导入题库备份" close={() => setIncoming(null)}><p className="dialog-description">备份中有 {incoming.groups.length} 个分组、{getQuestions(incoming).length} 道题。导入会替换此浏览器中的题库、学习进度和默写草稿。</p><p className="import-note">点击导入时，会先下载当前题库作为备份。</p><div className="modal-footer"><button className="button secondary" onClick={() => setIncoming(null)}>取消</button><button className="button primary" onClick={() => { downloadData(data); setData(incoming); setSaveBlocked(false); setIncoming(null); setUndoData(null); setToast("已导入题库，原题库已下载备份"); setActiveGroup(incoming.groups[0].id); setActiveTopic(incoming.groups[0].topics[0]?.id ?? ""); setActiveQuestion(""); }}><Upload size={15} />备份并导入</button></div></Modal>}
    {deletion && <Modal title={`删除${deletion.kind === "topic" ? "专题" : "题目"}`} close={() => setDeletion(null)}><p className="dialog-description">确定删除“{deletion.title}”？{deletion.kind === "topic" ? "专题内的题目、答案和默写草稿也会一并删除。" : "这道题的答案和默写草稿也会一并删除。"}</p><div className="modal-footer"><button className="button secondary" onClick={() => setDeletion(null)}>取消</button><button className="button danger-button" onClick={removeItem}><Trash2 size={15} />确定删除</button></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span>{undoData && <button onClick={() => { setData(undoData); setUndoData(null); setToast("已撤销删除"); }}>撤销</button>}<button className="toast-close" aria-label="关闭提示" onClick={() => { setToast(""); setUndoData(null); }}><X size={14} /></button></div>}
  </div>;
}
