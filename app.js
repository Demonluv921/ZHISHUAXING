/* ============================================================
   智刷星 · 交互逻辑
   ============================================================ */
(function () {
  "use strict";
  const D = window.ZHISHUA_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- 统一 API 请求（带可选访问口令，保护公网部署时的额度）---------- */
  function getSiteToken() { try { return localStorage.getItem("zhiSiteToken") || ""; } catch (e) { return ""; } }
  function setSiteToken(t) { try { localStorage.setItem("zhiSiteToken", t); } catch (e) {} }
  async function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers);
    const tk = getSiteToken();
    if (tk) opts.headers["X-Site-Token"] = tk;
    let resp = await fetch(url, opts);
    if (resp.status === 403) {
      let msg = "";
      try { const j = await resp.clone().json(); msg = j.error || ""; } catch (e) {}
      if (/token/i.test(msg)) {
        const input = window.prompt("此站点已启用访问口令，请输入口令（取消则不使用 AI 功能）：");
        if (input && input.trim()) {
          setSiteToken(input.trim());
          opts.headers["X-Site-Token"] = input.trim();
          resp = await fetch(url, opts);
        }
      }
    }
    return resp;
  }

  /* ---------- 移动端导航 ---------- */
  const navToggle = $("#navToggle");
  const navLinks = $("#navLinks");
  if (navToggle) {
    navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
    $$("#navLinks a").forEach(a => a.addEventListener("click", () => navLinks.classList.remove("open")));
  }

  /* ---------- 滚动揭示 & 数据数字动画 ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.12 });
  $$(".section, .footer").forEach(el => { el.classList.add("reveal"); revealObserver.observe(el); });

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = +el.dataset.target;
      const suffix = el.dataset.suffix || "";
      let cur = 0;
      const stepV = Math.max(1, target / 40);
      const timer = setInterval(() => {
        cur += stepV;
        if (cur >= target) { cur = target; clearInterval(timer); }
        el.textContent = (target >= 100 ? Math.round(cur) : cur.toFixed(0)) + suffix;
      }, 22);
      statObserver.unobserve(el);
    });
  }, { threshold: 0.5 });
  $$(".stat__num").forEach(el => statObserver.observe(el));

  /* ============================================================
     诊断互动
     ============================================================ */
  const courseGrid = $("#courseGrid");
  const startBtn = $("#startQuiz");
  const quizProgress = $("#quizProgress");
  const quizCount = $("#quizCount");
  const quizStage = $("#quizStage");
  const stepsItems = $$("#steps .steps__item");

  let selectedCourse = null;
  let answers = [];      // 每题用户选择（index 或 -1）
  let curQ = 0;
  let lastWeak = [];     // 记录上次诊断薄弱点，供模拟卷使用

  function setStep(n) {
    stepsItems.forEach(li => {
      const s = +li.dataset.step;
      li.classList.toggle("is-active", s === n);
      li.classList.toggle("is-done", s < n);
    });
  }
  function showPanel(id) {
    ["panel-course", "panel-quiz", "panel-result"].forEach(p => $("#" + p).classList.add("hidden"));
    $("#" + id).classList.remove("hidden");
  }

  /* 渲染课程 */
  function renderCourses() {
    courseGrid.innerHTML = "";
    D.courseGroups.forEach(g => {
      const title = document.createElement("div");
      title.className = "course-group__title";
      title.textContent = g.group;
      courseGrid.appendChild(title);
      g.courses.forEach(id => {
        const c = D.courses[id];
        const el = document.createElement("div");
        el.className = "course";
        el.innerHTML = `<span>${c.icon} ${c.name}</span><span class="course__tag">可诊断</span>`;
        el.addEventListener("click", () => {
          $$(".course").forEach(x => x.classList.remove("is-selected"));
          el.classList.add("is-selected");
          selectedCourse = c;
          startBtn.disabled = false;
        });
        courseGrid.appendChild(el);
      });
    });
  }

  /* 开始诊断 */
  startBtn.addEventListener("click", () => {
    if (!selectedCourse) return;
    answers = new Array(selectedCourse.questions.length).fill(-1);
    curQ = 0;
    setStep(1);
    showPanel("panel-quiz");
    renderQuestion();
  });

  /* 渲染单题 */
  function renderQuestion() {
    const q = selectedCourse.questions[curQ];
    quizProgress.style.width = ((curQ) / selectedCourse.questions.length * 100) + "%";
    quizCount.textContent = `第 ${curQ + 1} / ${selectedCourse.questions.length} 题`;
    const opts = q.options.map((o, i) =>
      `<label class="qopt" data-i="${i}"><input type="radio" name="opt" value="${i}"><span>${String.fromCharCode(65 + i)}. ${o}</span></label>`
    ).join("");
    quizStage.innerHTML = `
      <div class="qcard">
        <div class="qcard__q">${q.q}</div>
        <div class="qcard__opts">${opts}</div>
        <div class="qcard__explain" id="explain"></div>
        <div class="qcard__nav">
          <span></span>
          <button class="btn btn--primary" id="nextBtn">${curQ === selectedCourse.questions.length - 1 ? "查看诊断结果" : "下一题 →"}</button>
        </div>
      </div>`;
    const explain = $("#explain");
    const nextBtn = $("#nextBtn");
    let locked = false;
    $$(".qopt").forEach(opt => {
      opt.addEventListener("click", () => {
        if (locked) return;
        $$(".qopt").forEach(o => o.classList.remove("is-right", "is-wrong"));
        const i = +opt.dataset.i;
        answers[curQ] = i;
        opt.querySelector("input").checked = true;
        locked = true;
        // 标记对错
        $$(".qopt").forEach(o => {
          const oi = +o.dataset.i;
          if (oi === q.answer) o.classList.add("is-right");
          else if (oi === i) o.classList.add("is-wrong");
        });
        explain.innerHTML = `<b>解析：</b>${q.explain}`;
        explain.classList.add("show");
        nextBtn.focus();
      });
    });
    nextBtn.addEventListener("click", () => {
      if (answers[curQ] === -1) { alert("请先选择一个答案，再继续～"); return; }
      if (curQ < selectedCourse.questions.length - 1) { curQ++; renderQuestion(); }
      else { finishDiagnosis(); }
    });
  }

  /* 计算掌握度 & 渲染结果 */
  function finishDiagnosis() {
    setStep(3);
    showPanel("panel-result");
    const total = selectedCourse.questions.length;
    const correct = selectedCourse.questions.reduce((acc, q, i) => acc + (answers[i] === q.answer ? 1 : 0), 0);

    // 每个知识点掌握度
    const kpStat = {};
    selectedCourse.graph.nodes.forEach(n => kpStat[n.id] = { total: 0, right: 0 });
    selectedCourse.questions.forEach((q, i) => {
      q.kp.forEach(k => { kpStat[k].total++; if (answers[i] === q.answer) kpStat[k].right++; });
    });
    function level(n) {
      const s = kpStat[n.id];
      if (s.total === 0) return "untest";
      const r = s.right / s.total;
      if (r >= 0.999) return "strong";
      if (r >= 0.5) return "mid";
      return "weak";
    }

    // 分数
    const scoreNum = $("#scoreNum");
    animateNumber(scoreNum, correct / total * 100);
    quizProgress.style.width = "100%";

    // 图谱
    drawGraph(level);

    // 路径推荐：弱→中→强
    const order = { weak: 0, mid: 1, strong: 2, untest: 3 };
    const ranked = selectedCourse.graph.nodes.slice().sort((a, b) => order[level(a)] - order[level(b)]);
    lastWeak = ranked.filter(n => level(n) === "weak").map(n => n.name);
    const pathList = $("#pathList");
    const tips = {
      weak: "薄弱，建议优先重做相关例题 + AI 逐步讲解，直到能独立推导。",
      mid: "一般，建议做 3–5 道变式题巩固，注意易错细节。",
      strong: "掌握较好，可转入综合题与跨课程关联练习提升熟练度。",
      untest: "本次诊断未覆盖，建议在后续专项中补充测试。"
    };
    pathList.innerHTML = ranked.map(n => {
      const lv = level(n);
      return `<li class="${lv === 'weak' ? 'p-weak' : ''}"><b>${n.name}</b> — ${tips[lv]}</li>`;
    }).join("");
  }

  function animateNumber(el, target) {
    let cur = 0;
    const timer = setInterval(() => {
      cur += 4; if (cur >= target) { cur = target; clearInterval(timer); }
      el.textContent = Math.round(cur) + " 分";
    }, 18);
  }

  /* 绘制知识图谱 SVG */
  function drawGraph(levelFn) {
    const svg = $("#kgraph");
    const NS = "http://www.w3.org/2000/svg";
    const colors = { strong: "#22c55e", mid: "#f59e0b", weak: "#ef4444", untest: "#94a3b8" };
    const pos = {}; selectedCourse.graph.nodes.forEach(n => pos[n.id] = n);

    let html = "";
    // edges
    selectedCourse.graph.edges.forEach(([a, b]) => {
      const na = pos[a], nb = pos[b];
      html += `<line class="edge" x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}"/>`;
    });
    // nodes
    selectedCourse.graph.nodes.forEach(n => {
      const lv = levelFn(n);
      const r = lv === "weak" ? 23 : 19;
      html += `<g class="node ${lv === 'weak' ? 'weak' : ''}" data-name="${n.name}" data-lv="${lv}">
        <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${colors[lv]}" stroke="#0f172a" stroke-width="2"/>
        <text x="${n.x}" y="${n.y + 40}" text-anchor="middle">${n.name}</text></g>`;
    });
    svg.innerHTML = html;

    // hover tooltip
    $$("#kgraph .node").forEach(g => {
      g.addEventListener("mouseenter", () => {
        const lvTxt = { strong: "掌握较好", mid: "一般", weak: "薄弱", untest: "未覆盖" }[g.dataset.lv];
        g.querySelector("circle").setAttribute("stroke", "#fff");
        g.querySelector("circle").setAttribute("stroke-width", "3");
      });
      g.addEventListener("mouseleave", () => {
        g.querySelector("circle").setAttribute("stroke", "#0f172a");
        g.querySelector("circle").setAttribute("stroke-width", "2");
      });
    });
  }

  /* 重新诊断 */
  $("#restartDiag").addEventListener("click", () => {
    selectedCourse = null;
    startBtn.disabled = true;
    $$(".course").forEach(x => x.classList.remove("is-selected"));
    setStep(0);
    showPanel("panel-course");
  });

  renderCourses();

  /* ============================================================
     苏格拉底式讲题（演示性回复）
     ============================================================ */
  const chat = $("#socratChat");
  const input = $("#socratInput");
  const sendBtn = $("#socratSend");
  const botReplies = [
    "嗯，先别急着要答案。你觉得自己卡在哪一步？把已知条件再梳理一遍试试。",
    "很好，继续——这一步你打算用哪个概念或公式？说错也没关系，我们一起推。",
    "方向对了 👍 那如果把这个条件代入，下一步会得到什么？慢慢写。",
    "你离答案很近了！再检查一下边界情况，结论站得住吗？",
    "你看，这次是你自己推出来的。把思路记下来，下次遇到同类题就会更快。"
  ];
  let ri = 0;
  function addMsg(text, who) {
    const m = document.createElement("div");
    m.className = "msg msg--" + who;
    m.textContent = text;
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
  }
  function sendSocrat() {
    const v = input.value.trim();
    if (!v) return;
    addMsg(v, "user");
    input.value = "";
    setTimeout(() => {
      addMsg(botReplies[ri % botReplies.length], "bot");
      ri++;
    }, 550);
  }
  sendBtn.addEventListener("click", sendSocrat);
  input.addEventListener("keydown", e => { if (e.key === "Enter") sendSocrat(); });

  /* ============================================================
     考前冲刺模拟卷生成（演示）
     ============================================================ */
  $("#genMock").addEventListener("click", () => {
    const basis = $("input[name='mockbasis']:checked").value;
    const count = +$("input[name='mockcount']:checked").value;
    const paper = $("#mockPaper");
    const basisTxt = { weak: "薄弱点优先", mixed: "薄弱+高频混合", full: "全章节均衡" }[basis];

    // 选知识点
    let pool;
    if (basis === "weak") {
      pool = lastWeak.length ? lastWeak : ["条件概率与独立性", "期望与方差", "协方差与相关系数"];
    } else if (basis === "mixed") {
      pool = ["贝叶斯公式", "常见分布", "期望与方差", "协方差与相关系数", "分布函数", "多维随机变量"];
    } else {
      pool = selectedCourse.graph.nodes.map(n => n.name);
    }
    const picks = [];
    for (let i = 0; i < count; i++) picks.push(pool[i % pool.length]);

    const items = picks.map((kp, i) => `
      <div class="mp__item">
        <div class="mp__meta">第 ${i + 1} 题 · 关联知识点：${kp} · 难度 ${["易", "中", "中", "难"][i % 4]}</div>
        <div class="mp__q">【示例】围绕“${kp}”命制一道综合应用题，要求写出推导过程（AI 依据你的答题数据动态生成）。</div>
      </div>`).join("");

    paper.innerHTML = `
      <div class="mp__head">
        <h3>智刷星 · 考前冲刺模拟卷</h3>
        <span>${selectedCourse ? selectedCourse.name : "概率论与数理统计"} · ${count} 题 · ${basisTxt}</span>
      </div>${items}
      <p style="margin-top:14px;font-size:12.5px;color:#94a3b8">※ 演示预览：真实产品将依据你的诊断结果与课程重点，由 AI 生成可作答、带解析的完整试卷。</p>`;
  });

  /* ============================================================
     自带题库 / 自定义刷题
     用户粘贴题目 → 自动分析知识点 → 总结 → 出模拟卷
     ============================================================ */
  (function initSelfBank() {
    const input = $("#sbInput");
    const analyzeBtn = $("#sbAnalyze");
    const llmBtn = $("#sbAnalyzeLLM");
    const sampleBtn = $("#sbSample");
    const clearBtn = $("#sbClear");
    const resultEl = $("#sbResult");
    const summaryEl = $("#sbSummary");
    const aiSummaryEl = $("#sbAiSummary");
    const questionsEl = $("#sbQuestions");
    const genBtn = $("#sbGenMock");
    const genRawBtn = $("#sbGenMockRaw");
    const saveBtn = $("#sbSave");
    const printBtn = $("#sbPrint");
    const kpFilterEl = $("#sbKpFilter");
    const mockPaperEl = $("#sbMockPaper");
    const STORE_KEY = "zhishua_selfbank_v1";

    // 知识点词典（关键词 → 知识点名）。前半部分复用平台已有知识点名称，
    // 后半部分为常用别名，覆盖数学/物理/化学/计算机/英语/政治等高频术语。
    const ALIASES = [
      // 数学
      ["求极限", "函数与极限"], ["连续", "函数与极限"], ["导数", "导数与微分"],
      ["微分中值", "微分中值定理"], ["中值定理", "微分中值定理"], ["积分", "定积分"],
      ["不定积分", "不定积分"], ["定积分", "定积分"], ["面积", "定积分应用"],
      ["偏导", "多元函数微分"], ["多元", "多元函数微分"], ["重积分", "重积分"],
      ["级数", "无穷级数"], ["微分方程", "微分方程"],
      ["行列式", "行列式"], ["矩阵", "矩阵运算"], ["秩", "矩阵的秩"],
      ["逆矩阵", "逆矩阵"], ["线性方程组", "线性方程组"], ["特征值", "特征值与特征向量"],
      ["特征向量", "特征值与特征向量"], ["对角化", "相似对角化"], ["二次型", "二次型"],
      ["向量空间", "向量空间"],
      ["事件", "样本空间与事件"], ["样本空间", "样本空间与事件"], ["古典概型", "古典概型"], ["条件概率", "条件概率与独立性"],
      ["独立", "条件概率与独立性"], ["全概率", "全概率与贝叶斯"], ["贝叶斯", "全概率与贝叶斯"],
      ["随机变量", "随机变量"], ["分布函数", "分布函数"], ["期望", "期望与方差"],
      ["方差", "期望与方差"], ["泊松", "常见分布"], ["正态", "常见分布"], ["二项", "常见分布"],
      ["协方差", "协方差与相关系数"], ["相关系数", "协方差与相关系数"],
      ["中心极限", "大数定律与中心极限定理"], ["大数定律", "大数定律与中心极限定理"],
      ["参数估计", "参数估计"],
      ["密度", "分布函数"], ["均匀", "常见分布"], ["指数", "常见分布"],
      ["置信", "参数估计"], ["矩估计", "参数估计"], ["极大似然", "参数估计"],
      ["无偏估计", "参数估计"],
      ["命题", "命题逻辑"], ["谓词", "谓词逻辑"], ["集合", "集合与关系"], ["关系", "集合与关系"],
      ["图论", "图的基本概念"], ["树", "树与二叉树"], ["欧拉", "欧拉图与哈密顿图"],
      ["哈密顿", "欧拉图与哈密顿图"], ["群", "群、环、域"], ["布尔", "格与布尔代数"],
      // 物理
      ["运动", "质点运动学"], ["牛顿", "牛顿运动定律"], ["动量", "动量与冲量"],
      ["冲量", "动量与冲量"], ["功", "功与能"], ["能", "功与能"], ["刚体", "刚体定轴转动"],
      ["转动", "刚体定轴转动"], ["振动", "振动与波"], ["波", "振动与波"], ["静电", "静电场"],
      ["电场", "静电场"], ["磁场", "稳恒磁场"], ["磁感应", "稳恒磁场"],
      ["电磁感应", "电磁感应"], ["光学", "波动光学"],
      // 化学
      ["物质的量", "物质的量与浓度"], ["浓度", "物质的量与浓度"], ["摩尔", "物质的量与浓度"],
      ["热力学", "化学热力学"], ["焓", "化学热力学"], ["平衡", "化学平衡"],
      ["酸碱", "酸碱平衡"], ["pH", "酸碱平衡"], ["沉淀", "沉淀溶解平衡"],
      ["溶度积", "沉淀溶解平衡"], ["氧化还原", "氧化还原与电化学"], ["原电池", "氧化还原与电化学"],
      ["电化学", "氧化还原与电化学"], ["原子结构", "原子结构"], ["电子", "原子结构"],
      ["化学键", "分子结构与化学键"], ["分子结构", "分子结构与化学键"],
      ["配位", "配位化合物"], ["速率", "化学反应速率"],
      // 计算机
      ["线性表", "线性表"], ["栈", "栈与队列"], ["队列", "栈与队列"], ["串", "串"],
      ["二叉树", "树与二叉树"], ["图", "图"], ["查找", "查找"], ["二分", "查找"],
      ["排序", "排序"], ["哈希", "哈希表"], ["堆", "堆"], ["递归", "递归与分治"],
      ["分治", "递归与分治"], ["指针", "指针"], ["数组", "数组"], ["结构体", "结构体"],
      ["文件", "文件操作"], ["内存", "动态内存"], ["字符串", "字符串"],
      ["控制结构", "控制结构"], ["函数", "函数"], ["关系模型", "数据模型"],
      ["关系代数", "关系代数"], ["SQL", "SQL基础"], ["规范化", "关系规范化"],
      ["范式", "关系规范化"], ["函数依赖", "函数依赖"], ["事务", "事务与并发"],
      ["索引", "索引"], ["视图", "视图与安全"], ["E-R", "E-R模型"], ["E-R模型", "E-R模型"],
      // 英语
      ["词汇", "词汇与搭配"], ["搭配", "词汇与搭配"], ["时态", "语法·时态语态"],
      ["语态", "语法·时态语态"], ["虚拟语气", "语法·时态语态"], ["长难句", "长难句分析"],
      ["阅读", "阅读理解"], ["完形", "完形填空"], ["翻译", "翻译·汉译英"],
      ["写作", "写作"], ["听力", "听力策略"],
      ["persistent", "词汇与搭配"], ["determined", "词汇与搭配"],
      ["By the time", "语法·时态语态"], ["had left", "语法·时态语态"],
      ["infer", "阅读理解"], ["predict", "听力策略"], ["argument", "写作"],
      // 政治的别名
      ["唯物", "唯物论"], ["辩证", "辩证法"], ["矛盾", "辩证法"], ["认识", "认识论"],
      ["实践", "认识论"], ["历史唯物", "历史唯物主义"], ["剩余价值", "剩余价值理论"],
      ["劳动价值", "劳动价值论"], ["资本", "政治经济学"], ["科学社会主义", "科学社会主义"],
      ["毛泽东", "毛泽东思想"], ["新民主主义", "新民主主义革命"], ["改造", "社会主义改造"],
      ["邓小平", "邓小平理论"], ["三个代表", "“三个代表”重要思想"], ["科学发展观", "科学发展观"],
      ["新时代", "习近平新时代中国特色社会主义思想"], ["中国式现代化", "中国式现代化"],
      ["近代", "近代中国社会性质"], ["洋务", "太平天国与洋务运动"], ["戊戌", "戊戌变法"],
      ["辛亥", "辛亥革命"], ["五四", "新文化运动与五四运动"], ["中共", "中共成立与大革命"],
      ["抗日", "抗日战争"], ["改革开放", "新中国成立与改革开放"], ["建国", "新中国成立与改革开放"],
      ["人生", "人生观与人生价值"], ["理想", "理想信念"], ["中国精神", "中国精神"],
      ["核心价值观", "社会主义核心价值观"], ["道德", "道德修养"], ["美德", "道德修养"], ["仁爱", "道德修养"],
      ["法治", "法治思维"], ["宪法", "宪法"], ["权利", "权利与义务"], ["义务", "权利与义务"]
    ];

    const KEYWORDS = [];
    for (const id in D.courses) {
      D.courses[id].graph.nodes.forEach(n => KEYWORDS.push([n.name, n.name]));
    }
    ALIASES.forEach(a => KEYWORDS.push(a));

    let QUESTIONS = []; // { q, options:[], answer:int, kps:[], autoKps:[] }

    const SAMPLE = `1. 求 f(x)=x³ 在 x=2 处的导数值 f'(2)：
A. 6  B. 12  C. 8  D. 9
答案：B

2. 设随机变量 X~B(10,0.3)，则 E(X)=？
A. 3  B. 7  C. 0.3  D. 10
【答案】A

3. 物质的唯一特性是？
A. 客观实在性  B. 运动  C. 可知性  D. 有用性
答案：A

4. 辛亥革命推翻了？
A. 清王朝君主专制  B. 北洋政府  C. 南京国民政府  D. 帝国主义
答案：A

5. By the time we arrived, the train ___.
A. left  B. had left  C. has left  D. leaves
答案：B

6. 儒家“仁爱”思想主要属于哪一范畴？
A. 中华传统美德  B. 法治思维  C. 政治经济学  D. 科学社会主义
答案：A

7. 中国共产党成立于哪一年？
A. 1921  B. 1927  C. 1949  D. 1919
答案：A

8. 马克思主义认为，矛盾的两种基本属性是？
A. 同一性与斗争性  B. 普遍性与特殊性  C. 质与量  D. 内容与形式
答案：A`;

    // 仿华科《概率论与数理统计》期末卷（1037.wiki 真实版式：选择/填空/计算/应用 + 末尾参考答案）
    const EXAM_SAMPLE = `一、选择题（每小题 4 分，共 16 分）
1. 设 A、B 为随机事件，且 P(A)=0.5，P(B)=0.3，P(A∪B)=0.7，则 P(AB)=？
A. 0.1  B. 0.2  C. 0.3  D. 0.4
2. 随机变量 X ~ B(10, 0.3)，则 E(X)=？
A. 3  B. 7  C. 0.3  D. 10
3. 设 X ~ N(0,1)，则 P(|X|<1)≈？
A. 0.6826  B. 0.9544  C. 0.9974  D. 0.5000
4. 若 X、Y 相互独立，且 D(X)=2，D(Y)=3，则 D(2X-3Y)=？
A. 35  B. 31  C. 17  D. 13

二、填空题（每小题 4 分，共 12 分）
5. 设随机变量 X 服从参数为 λ 的泊松分布，且 E(X)=2，则 λ=____。
6. 已知 P(A)=0.6，P(B|A)=0.5，则 P(AB)=____。
7. 设 X 与 Y 的相关系数 ρ=0，则 X 与 Y ____（填"独立"或"不独立"）。

三、计算题（每小题 12 分，共 24 分）
8. 袋中有 3 个红球、2 个白球，共 5 个球，不放回地任取 2 次，求两次都取到红球的概率。
9. 设随机变量 X 的密度函数为 f(x)=2x (0<x<1)，求 E(X) 与 D(X)。

四、应用题（18 分）
10. 某厂产品次品率为 0.02，每箱装 100 件，求一箱中次品数不少于 2 件的概率（用泊松近似）。

参考答案
1. A 2. A 3. A 4. A 5. 2 6. 0.3 7. 不独立 8. 3/10 9. E=2/3,D=1/18 10. 1-3e^-2`;


    // 真实真题：2024-2025 学年《概率论与数理统计》期末考试 A 卷
    // 来源：用户提供的 PDF《概率论与数理统计期末考试A卷真题与解析汇编（Updated 2026.7.1）》
    // 重建说明：原 PDF 文本层为 AI-OCR，中文连接词有损；本题由 PDF 中"试卷"与"答案"两部分交叉核对重建，
    // 数学符号、选项与参考答案均取自原卷，仅对个别 OCR 乱码处做可读性还原。题目统一采用全局编号 1-16，
    // 以保持末尾"参考答案"答题卡编号与解析切题序号一一对应（真实试卷填空题常重置为 1-4，会冲突）。
    const REAL_EXAM_2024_2025 = `（以下为 2024-2025 学年《概率论与数理统计》期末考试 A 卷 真题，取自用户提供的真题汇编 PDF，含选择题 10 题、填空题 4 题、应用题与综合题。）

1. 设 A、B 为样本空间中的两个事件，已知 P(A)=1/9，P(A∪B)=2/3，则 P(B)=（ ）
A. 1/9  B. 1/3  C. 2/3  D. 7/9

2. 设随机变量 X 的取值为 0、2、3，对应的概率分别为 0.3、0.1、0.6，令 Y=3(X−1)²，求 Y 的分布函数 F_Y(y)，则 F_Y(7)=（ ）
A. 0.3  B. 0.4  C. 0.6  D. 0.7

3. 设随机变量 X 在区间 (0,1) 上服从均匀分布，即 X~U(0,1)，则 Y=ln X 的密度函数为（ ）
A. p_Y(y)=e^{−y} I_{(0,+∞)}(y)  B. p_Y(y)=e^{−y} I_{(−∞,0)}(y)  C. p_Y(y)=e^{y} I_{(0,+∞)}(y)  D. p_Y(y)=e^{y} I_{(−∞,0)}(y)

4. 设随机变量 X、Y 均服从标准正态分布 N(0,1)，则下列结论正确的是（ ）
A. X+Y~N(0,2)  B. X−Y~N(0,2)  C. (X,Y) 相互独立  D. 2X~N(0,4)

5. 设随机变量 X_1,…,X_n 独立同分布且数学期望为 λ，X̄=(1/n)∑_{k=1}^n X_k，则由中心极限定理可知（ ）
A. X_1−X̄ 与 X_2−X̄ 相互独立  B. X_1−X̄ 与 X_2−X̄ 相关  C. 当 n 充分大，P{a<nX̄≤b}≈Φ((b−nλ)/√(nλ²))−Φ((a−nλ)/√(nλ²))  D. 当 n 充分大，P{a<nX̄≤b}≈Φ((b−nλ)/√(nλ))−Φ((a−nλ)/√(nλ))

6. 对数据 1、5、5、13、9、10、10、8、24，下列说法正确的是（ ）
A. 其中位数是 9  B. 其中众数是 10  C. 其中极差是 8  D. 其中最大值是 24

7. 设 (X_1,X_2,X_3,X_4) 是来自正态总体 N(1,2²) 的简单随机样本，Y=√[3(X_1−1)] / √[(X_2−1)²+(X_3−1)²+(X_4−1)²]，则 Y 服从（ ）
A. χ²(3)  B. F(1,3)  C. t(3)  D. t(2)

8. 设 θ 为总体 X~U(0,θ) 的未知参数，构造了 θ 的置信水平为 95% 的置信区间，则该置信区间的含义是（ ）
A. θ 落入该区间的概率为 95%  B. θ 落入该区间的概率为 5%  C. 该区间以 95% 的把握包含 θ  D. 该区间以 5% 的把握包含 θ

9. 设 X_1、X_2 为来自两点分布（即二项分布 B(1,p)）的简单随机样本，记 X₁*=min(X_1,X_2)，X₂*=max(X_1,X_2)，则下列结论正确的是（ ）
A. X₁* 与 X₂* 相互独立  B. X₁* 与 X₂* 相关  C. X₁* ~ B(1,p²)  D. X₂* ~ B(1,1−p²)

10. 设 θ̂₀、θ̂₁ 是未知参数 θ 的两个无偏估计，D(θ̂₀)=σ₀²，D(θ̂₁)=σ₁²，令 θ̂_α=αθ̂₁+(1−α)θ̂₀（0≤α≤1），则使 D(θ̂_α) 达到最小的 α 为（ ）
A. σ₁²/(σ₀²+σ₁²)  B. σ₀²/(σ₀²+σ₁²)  C. σ₁/(σ₀+σ₁)  D. σ₀/(σ₀+σ₁)

11. 袋中有 5 个红球、4 个白球，从中任取 3 个，则恰有 2 个红球的概率为 ______。（古典概型）

12. 设随机变量 X 服从参数为 μ 的指数分布 E(μ)，Y 服从参数为 λ 的指数分布 E(λ)，且 X、Y 相互独立，则 P{X>Y}= ______。

13. 设 (X,Y) 服从单位圆 {(x,y): x²+y²=1} 上的均匀分布，则条件概率 P{Y>1/2 | X=1}= ______。

14. 设随机变量 X 服从参数为 λ 的指数分布 E(λ)，若随机区间 [X,2X] 包含常数 1/λ 的概率恰好为 1/λ，则 λ= ______。

15. 应用题（12 分）：设 φ(x)、Φ(x) 分别为标准正态分布 N(0,1) 的密度函数与分布函数。对参数 λ，定义 p_λ(x)=2φ(x)Φ(λx)，x∈R。(1) 证明 p_λ(x) 是概率密度函数（对任意 λ 均成立）；(2) 设随机变量 X 服从密度为 p_1(x) 的分布，Y~B(1,p)（二项分布）且与 X 独立，Z=XY，求 Z 的分布。

16. 综合题（14 分）：设总体 X~B(m,p)（二项分布），其中 p 未知，X_1,X_2,…,X_n 是来自 X 的简单随机样本（i.i.d.）。(1) 求 p² 的矩估计；(2) 判断所求 p² 的矩估计是否为无偏估计；(3) 求 p² 的极大似然估计。

参考答案
1. C 2. B 3. D 4. D 5. D 6. A 7. C 8. C 9. D 10. B 11. 5/6 12. λ/(λ+μ) 13. 0 14. 1/(e^{-1/2}−e^{-1})`;

    function esc(s) {
      return (s == null ? "" : String(s)).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function flash(btn, txt) {
      const o = btn.textContent;
      btn.textContent = txt;
      setTimeout(() => { btn.textContent = o; }, 1500);
    }

    // 从全文提取末尾"参考答案"答题卡：形如 1.A 2.B 3.C ……
    function extractAnswerKey(text) {
      const m = text.match(/(参考)?答案[：:\s]*([\s\S]*)$/i);
      if (!m) return {};
      const body = m[2];
      const map = {};
      const re = /(\d+)\s*[\.．、)）]?\s*[:：]?\s*\(?([A-Da-d])\)?/g;
      let mm;
      while ((mm = re.exec(body))) {
        map[parseInt(mm[1], 10)] = "ABCD".indexOf(mm[2].toUpperCase());
      }
      return map;
    }

    // 解析粘贴文本：以"题号+标点"切分题目（兼容空行/无空行版式），识别选项与答案；
    // 支持末尾"参考答案"答题卡（如 1.A 2.B …），并容忍题干中的 P(A)、f(x) 等干扰。
    function parseQuestions(raw) {
      const text = raw.replace(/\r/g, "");
      const key = extractAnswerKey(text);
      // 先去掉末尾"参考答案"区域，避免其编号干扰切题
      const work = text.replace(/(参考)?答案[\s\S]*$/i, "");
      const segRe = /(^|\n)\s*(\d{1,3})\s*[\.．、)）](?![0-9])/g;
      const segs = [];
      let pending = null, m;
      while ((m = segRe.exec(work))) {
        const num = parseInt(m[2], 10);
        const end = m.index + m[0].length;
        if (pending) segs.push({ num: pending.num, body: work.slice(pending.end, m.index).trim() });
        pending = { num, end };
      }
      if (pending) segs.push({ num: pending.num, body: work.slice(pending.end).trim() });

      const out = [];
      segs.forEach(s => {
        const b = s.body;
        if (!b) return;
        let answer = -1;
        const am = b.match(/(?:【?答案】?|\[答案\])\s*[:：]?\s*([A-Da-d])/i)
          || b.match(/\bans(?:wer)?\s*[:：]?\s*([A-Da-d])/i)
          || b.match(/(?:^|\s)[（(]\s*([A-Da-d])\s*[)）]/);
        if (am) answer = "ABCD".indexOf(am[1].toUpperCase());
        // 定位首个选项（要求选项字母前有行首或空白，避开 P(A)、f(x) 等）；
        // 顿号 、 仅当它后面不是紧接另一个选项字母时才算选项分隔（避开题干里的 "A、B 两事件" 这类枚举写法）
        const optM = b.match(/(?:^|\s)([A-Da-d])(?:[\.．)）]|、(?![A-Da-d]))/);
        let stem = b, optsText = "";
        if (optM) {
          const oi = optM.index + optM[0].indexOf(optM[1]); // 定位选项字母本身（避开前导空白/标点）
          stem = b.slice(0, oi).trim();
          optsText = b.slice(oi);
        } else {
          stem = b.trim();
        }
        const options = [];
        if (optsText) {
          const re = /([A-Da-d])[\.、．）]\s*([\s\S]*?)(?=\s*[A-Da-d][\.、．）]|$)/g;
          let mm;
          while ((mm = re.exec(optsText))) {
            const ai = "ABCD".indexOf(mm[1].toUpperCase());
            options[ai] = mm[2].trim();
          }
        }
        const opts = options.filter(Boolean);
        const q = stem.replace(/\s+/g, " ").trim();
        if (q || opts.length) {
          if (answer < 0 && key[s.num] !== undefined) answer = key[s.num];
          out.push({ q: q, options: opts, answer: answer });
        }
      });
      return out;
    }

    // 基于词典自动识别知识点
    const GENERIC_KP = new Set(["函数"]); // 过于通用的节点，跨课噪声大，改为仅手动添加
    function detectKps(text) {
      const t = text.toLowerCase();
      const found = [];
      KEYWORDS.forEach(([kw, kp]) => {
        if (GENERIC_KP.has(kw)) return;
        if (t.indexOf(kw.toLowerCase()) !== -1) found.push(kp);
      });
      return Array.from(new Set(found));
    }

    function renderSummary() {
      const total = QUESTIONS.length;
      const withAuto = QUESTIONS.filter(q => q.autoKps.length).length;
      const dist = {};
      QUESTIONS.forEach(q => q.kps.forEach(k => { dist[k] = (dist[k] || 0) + 1; }));
      const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
      const max = entries.length ? entries[0][1] : 1;
      const bars = entries.map(([k, c]) => `
        <div class="sb__bar">
          <span title="${esc(k)}">${esc(k)}</span>
          <div class="sb__bar-track"><div class="sb__bar-fill" style="width:${Math.round(c / max * 100)}%"></div></div>
          <span class="sb__bar-count">${c}</span>
        </div>`).join("");
      summaryEl.innerHTML = `
        <h3>📊 知识点分析总结</h3>
        <div class="sb__stat-row">
          <div class="sb__stat"><b>${total}</b><span>已解析题目</span></div>
          <div class="sb__stat"><b>${entries.length}</b><span>识别出知识点</span></div>
          <div class="sb__stat"><b>${withAuto}</b><span>自动识别题目</span></div>
        </div>
        ${entries.length ? `<div class="sb__bars">${bars}</div>`
          : `<p style="color:#94a3b8">暂未自动识别到知识点，可在下方为每题手动添加标签。</p>`}
        <p style="margin-top:14px;font-size:12.5px;color:#94a3b8">※ 自动识别基于平台知识点词典（含数学/物理/化学/计算机/英语/政治等常用术语）；未命中或标错的，可在下方逐题增删标签，使其更贴合你的实际考情。</p>`;
    }

    function renderQuestions() {
      questionsEl.innerHTML = "";
      QUESTIONS.forEach((q, qi) => {
        const optsHtml = q.options.length
          ? q.options.map((o, i) => `<span>${String.fromCharCode(65 + i)}. ${esc(o)}</span>`).join("")
          : `<span style="color:#94a3b8">（无选项 / 简答题）</span>`;
        const chipsHtml = q.kps.map((kp, ki) => {
          const isAuto = q.autoKps.indexOf(kp) !== -1;
          return `<span class="sb__chip ${isAuto ? "sb__chip--auto" : ""}">${esc(kp)}<button data-q="${qi}" data-k="${ki}" aria-label="删除">×</button></span>`;
        }).join("");
        const card = document.createElement("div");
        card.className = "sb__qcard";
        card.innerHTML = `
          <div class="sb__qcard-q">${qi + 1}. ${esc(q.q) || "（题干为空）"}</div>
          <div class="sb__qcard-opts">${optsHtml}</div>
          <div class="sb__chips">${chipsHtml}<input class="sb__chip-add" placeholder="添加知识点标签，回车确认…" data-q="${qi}"></div>`;
        questionsEl.appendChild(card);
      });
      questionsEl.querySelectorAll(".sb__chip button").forEach(btn => {
        btn.addEventListener("click", () => {
          const qi = +btn.dataset.q, ki = +btn.dataset.k;
          const kpVal = QUESTIONS[qi].kps[ki];
          QUESTIONS[qi].kps.splice(ki, 1);
          const ai = QUESTIONS[qi].autoKps.indexOf(kpVal);
          if (ai >= 0) QUESTIONS[qi].autoKps.splice(ai, 1);
          renderQuestions(); renderSummary(); renderKpFilter();
        });
      });
      questionsEl.querySelectorAll(".sb__chip-add").forEach(inp => {
        inp.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            const qi = +inp.dataset.q;
            const v = inp.value.trim();
            if (v) { QUESTIONS[qi].kps.push(v); renderQuestions(); renderSummary(); renderKpFilter(); }
          }
        });
      });
    }

    function renderKpFilter() {
      const all = Array.from(new Set(QUESTIONS.flatMap(q => q.kps)));
      kpFilterEl.innerHTML = all.map(k =>
        `<label class="sb__kpf"><input type="checkbox" value="${esc(k)}"><span>${esc(k)}</span></label>`).join("");
      kpFilterEl.querySelectorAll(".sb__kpf").forEach(lab => {
        const cb = lab.querySelector("input");
        cb.addEventListener("change", () => lab.classList.toggle("is-on", cb.checked));
      });
    }

    function showResult() {
      resultEl.classList.remove("hidden");
      renderSummary();
      renderQuestions();
      const allR = $("input[name='sbbasis'][value='all']");
      if (allR) allR.checked = true;
      kpFilterEl.classList.add("hidden");
      mockPaperEl.innerHTML = `<div class="mock__placeholder">解析题目后，点击左侧按钮即可基于此批题目生成模拟卷…</div>`;
      resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function analyze() {
      const raw = input.value.trim();
      if (!raw) { alert("请先粘贴题目～"); return; }
      const parsed = parseQuestions(raw);
      if (!parsed.length) { alert("没能识别出题目，请确认每题之间空一行、题号与选项清晰。"); return; }
      QUESTIONS = parsed.map(q => {
        const auto = detectKps(q.q);
        return { q: q.q, options: q.options, answer: q.answer, kps: auto.slice(), autoKps: auto.slice() };
      });
      showResult();
      save(true);
    }

    // 渲染 AI 智能分析总结（summary 为对象；errMsg 存在时表示未启用/失败）
    function renderAiSummary(summary, errMsg) {
      if (errMsg) {
        aiSummaryEl.innerHTML = `
          <div class="sb__ai sb__ai--off">
            <div class="sb__ai-head"><span>🤖 AI 深度分析未启用</span></div>
            <p>${esc(errMsg)}</p>
            <p class="sb__ai-hint">启用方法：在站点目录下复制 <code>.env.example</code> 为 <code>.env</code>，填入 <code>LLM_API_KEY</code> / <code>LLM_BASE_URL</code> / <code>LLM_MODEL</code>（各厂商示例已写在注释里），然后重启本地服务（<code>python server.py</code>）即可。</p>
          </div>`;
        return;
      }
      const topics = (summary.topics || []).map(t => `<span class="sb__chip">${esc(t)}</span>`).join("");
      const plan = (summary.reviewPlan || []).map(p => `<li>${esc(p)}</li>`).join("");
      aiSummaryEl.innerHTML = `
        <div class="sb__ai">
          <div class="sb__ai-head"><span>🤖 AI 智能分析总结</span><span class="sb__ai-badge">由大模型生成</span></div>
          ${summary.narrative ? `<p class="sb__ai-narr">${esc(summary.narrative)}</p>` : ""}
          ${topics ? `<div class="sb__ai-topics"><b>主要专题：</b>${topics}</div>` : ""}
          ${plan ? `<div class="sb__ai-plan"><b>复习建议：</b><ul>${plan}</ul></div>` : ""}
        </div>`;
    }

    // AI 深度分析：调用本地 /api/analyze（服务端再调大模型），失败自动回退本地
    async function analyzeWithLLM() {
      const raw = input.value.trim();
      if (!raw) { alert("请先粘贴题目～"); return; }
      const parsed = parseQuestions(raw);
      if (!parsed.length) { alert("没能识别出题目，请确认每题之间空一行、题号与选项清晰。"); return; }
      // 先按本地词典解析兜底，LLM 返回后再覆盖每题知识点
      QUESTIONS = parsed.map(q => {
        const auto = detectKps(q.q);
        return { q: q.q, options: q.options, answer: q.answer, kps: auto.slice(), autoKps: auto.slice() };
      });
      const oldTxt = llmBtn.textContent;
      llmBtn.disabled = true;
      llmBtn.textContent = "🤖 AI 分析中…";
      try {
        const resp = await apiFetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questions: QUESTIONS.map(q => ({ q: q.q, options: q.options, answer: q.answer }))
          })
        });
        const data = await resp.json();
        if (!data.llmEnabled) {
          renderAiSummary(null, data.reason || data.error || "LLM 未配置");
          showResult();
          alert("本地关键词分析已完成。AI 深度分析暂不可用（" +
            (data.reason || data.error || "LLM 未配置") + "），已自动回退到本地词典分析。");
        } else {
          const items = data.items || [];
          QUESTIONS.forEach((q, i) => {
            const it = items.find(x => x.index === i);
            if (it && it.kps && it.kps.length) {
              q.kps = it.kps.slice();
              q.autoKps = it.kps.slice();
            }
          });
          renderAiSummary(data.summary);
          showResult();
        }
      } catch (e) {
        renderAiSummary(null, "无法连接本地服务（" + e.message + "），已回退到本地分析。");
        showResult();
      } finally {
        llmBtn.disabled = false;
        llmBtn.textContent = oldTxt;
        save(true);
      }
    }

    function genMockRaw(note) {
      if (!QUESTIONS.length) { alert("请先解析题目。"); return; }
      const count = +$("input[name='sbcount']:checked").value;
      const basis = $("input[name='sbbasis']:checked").value;
      let pool = QUESTIONS.slice();
      if (basis === "focus") {
        const checked = Array.from(kpFilterEl.querySelectorAll("input:checked")).map(x => x.value);
        if (checked.length) {
          pool = QUESTIONS.filter(q => q.kps.some(k => checked.indexOf(k) !== -1));
        } else {
          alert("请先勾选至少一个知识点，或切换为“全部随机”。"); return;
        }
      }
      if (!pool.length) { alert("当前条件下没有可用题目，请调整筛选。"); return; }
      const picks = shuffle(pool).slice(0, Math.min(count, pool.length));
      const items = picks.map((q, i) => {
        const opts = q.options.length
          ? `<div class="mp__opts">${q.options.map((o, j) => `<div class="mp__opt">${String.fromCharCode(65 + j)}. ${esc(o)}</div>`).join("")}</div>`
          : "";
        return `<div class="mp__item"><div class="mp__meta">第 ${i + 1} 题</div><div class="mp__q">${esc(q.q)}</div>${opts}</div>`;
      }).join("");
      const keyHtml = picks.map((q, i) =>
        `<li>第 ${i + 1} 题：${q.answer >= 0 ? String.fromCharCode(65 + q.answer) + ". " + esc(q.options[q.answer]) : "（无答案）"}</li>`).join("");
      mockPaperEl.innerHTML = `
        <div class="mp__head">
          <h3>智刷星 · 自定义模拟卷</h3>
          <span>共 ${picks.length} 题 · 源自你提供的 ${QUESTIONS.length} 道题 · ${basis === "focus" ? "指定知识点" : "全部随机"}</span>
        </div>${note ? `<p class="sb__hint">⚠️ ${esc(note)}，已自动回退为「原题重排」。</p>` : ""}${items}
        <div class="mp__key"><h4>参考答案</h4><ol>${keyHtml}</ol></div>
        <p style="margin-top:14px;font-size:12.5px;color:#94a3b8">※ 本卷由你提供的题目随机抽取生成，可在上方调整题量或限定知识点后重新生成；点击「打印 / 导出 PDF」可留存。</p>`;
      mockPaperEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function genMock() {
      if (!QUESTIONS.length) { alert("请先解析题目。"); return; }
      const count = +$("input[name='sbcount']:checked").value;
      const basis = $("input[name='sbbasis']:checked").value;
      let topics;
      if (basis === "focus") {
        const checked = Array.from(kpFilterEl.querySelectorAll("input:checked")).map(x => x.value);
        if (!checked.length) { alert("请先勾选至少一个知识点，或切换为“全部随机”。"); return; }
        topics = checked;
      } else {
        topics = [...new Set(QUESTIONS.flatMap(q => q.kps || []))];
        if (!topics.length) { alert("未识别到知识点，无法生成。请先解析题目或手动补标签。"); return; }
      }
      const sample = QUESTIONS.slice(0, 3).map(q => q.q).join("\n").slice(0, 1500);
      genBtn.disabled = true;
      const oldTxt = genBtn.textContent;
      genBtn.textContent = "🤖 AI 出题中…";
      try {
        const resp = await apiFetch("/api/gen-exam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topics, count, course: "", sample }),
        });
        const data = await resp.json();
        if (data.ok && data.questions && data.questions.length) {
          renderAiExam(data.questions, data.model);
          return;
        }
        // AI 未成功（未配置 Key / 出错）→ 回退原题重排
        const msg = data.reason || data.error || "AI 生成未成功";
        console.warn("AI 生成回退原题重排：", msg);
        genMockRaw(msg);
      } catch (e) {
        console.warn("AI 生成异常，回退原题重排：", e);
        genMockRaw("AI 接口调用异常");
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = oldTxt;
      }
    }

    function renderAiExam(qs, model) {
      const items = qs.map((q, i) => {
        const opts = (q.options && q.options.length)
          ? `<div class="mp__opts">${q.options.map(o => `<div class="mp__opt">${esc(o)}</div>`).join("")}</div>`
          : "";
        let ans = q.answer;
        if ((q.type === "选择题") && typeof ans === "string" && /^[A-Da-d]$/.test(ans) && q.options) {
          const idx = ans.toUpperCase().charCodeAt(0) - 65;
          if (q.options[idx] != null) ans = ans.toUpperCase() + ". " + q.options[idx];
        }
        return `<div class="mp__item">
          <div class="mp__meta">第 ${i + 1} 题 <span class="mp__type">${esc(q.type || "题")}</span>${q.kp ? " · " + esc(q.kp) : ""}</div>
          <div class="mp__q">${esc(q.stem || "")}</div>${opts}
          <div class="mp__sol"><b>参考答案：</b>${esc(ans || "（略）")}<br><b>解析：</b>${esc(q.solution || "")}</div>
        </div>`;
      }).join("");
      mockPaperEl.innerHTML = `
        <div class="mp__head">
          <h3>智刷星 · AI 原创模拟卷</h3>
          <span>共 ${qs.length} 题 · 由大模型按你的薄弱知识点现场生成${model ? " · 模型 " + esc(model) : ""}</span>
        </div>${items}
        <p class="sb__hint">※ 题目由 AI 现场编写，答案与解析建议人工核对；点击「打印 / 导出 PDF」可留存。</p>`;
      mockPaperEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function save(silent) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ raw: input.value, questions: QUESTIONS }));
        if (!silent) flash(saveBtn, "已保存 ✓");
      } catch (e) { if (!silent) alert("保存失败：" + e.message); }
    }
    function load() {
      try {
        const s = localStorage.getItem(STORE_KEY);
        if (!s) return;
        const data = JSON.parse(s);
        if (data.raw) input.value = data.raw;
        if (data.questions && data.questions.length) { QUESTIONS = data.questions; showResult(); }
      } catch (e) { /* ignore */ }
    }

    // 上传图片 / 文件：图片走 /api/ocr，文件走 /api/parse-file；多文件并发后拼接到输入框并自动分析
    const fileInput = $("#sbFile");
    const uploadBtn = $("#sbUploadBtn");
    const uploadPreview = $("#sbUploadPreview");
    const uploadStatus = $("#sbUploadStatus");

    function setStatus(msg, kind) {
      uploadStatus.innerHTML = msg ? `<span class="sb__status-${kind || "info"}">${esc(msg)}</span>` : "";
    }
    function fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error("读取文件失败"));
        r.readAsDataURL(file);
      });
    }
    function showThumb(file, dataUrl) {
      if (!dataUrl || !String(dataUrl).startsWith("data:image")) return;
      const img = document.createElement("img");
      img.src = dataUrl;
      img.className = "sb__thumb";
      img.title = file.name;
      uploadPreview.appendChild(img);
    }

    async function handleFiles(files) {
      uploadPreview.innerHTML = "";
      const list = Array.from(files || []);
      if (!list.length) return;
      setStatus(`正在处理 ${list.length} 个文件… 🔄`, "info");
      const combined = [];
      const warned = [];
      let ok = 0;
      await Promise.all(list.map(async (file) => {
        const isImage = (file.type || "").startsWith("image/");
        try {
          const dataUrl = await fileToDataURL(file);
          if (isImage) {
            showThumb(file, dataUrl);
            const resp = await apiFetch("/api/ocr", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: dataUrl }),
            });
            const data = await resp.json();
            if (!data.ok) {
              warned.push(`「${file.name}」图片识别失败：${data.reason || data.error || "未知错误"}`);
              return;
            }
            if (data.text && data.text.trim()) combined.push(data.text.trim());
            else warned.push(`「${file.name}」未识别到文字。`);
          } else {
            const resp = await apiFetch("/api/parse-file", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: file.name, data: dataUrl }),
            });
            const data = await resp.json();
            if (!data.ok) {
              warned.push(`「${file.name}」解析失败：${data.error || data.note || "未知错误"}`);
              return;
            }
            if (data.text && data.text.trim()) combined.push(data.text.trim());
            else warned.push(`「${file.name}」未提取到文字${data.note ? "（" + data.note + "）" : ""}。`);
            if (data.note && data.text && data.text.trim()) warned.push(`「${file.name}」${data.note}`);
          }
          ok++;
        } catch (e) {
          warned.push(`「${file.name}」处理出错：${e.message}`);
        }
      }));

      if (combined.length) {
        const prefix = input.value.trim() ? input.value.trim() + "\n\n" : "";
        input.value = prefix + combined.join("\n\n");
      }
      const parts = [];
      if (ok) parts.push(`成功识别 ${ok} 个文件`);
      if (warned.length) parts.push(warned.join("；"));
      setStatus(parts.join("　|　") || "无内容", (warned.length && !ok) ? "err" : "ok");
      if (combined.length) analyze();  // 自动跑一遍解析→知识点→模拟卷
    }

    if (uploadBtn) uploadBtn.addEventListener("click", () => fileInput.click());
    if (fileInput) fileInput.addEventListener("change", (e) => {
      handleFiles(e.target.files);
      e.target.value = "";  // 允许重复选择同一文件
    });

    // 事件绑定
    analyzeBtn.addEventListener("click", analyze);
    llmBtn.addEventListener("click", analyzeWithLLM);
    sampleBtn.addEventListener("click", () => { input.value = SAMPLE; });
    const examSampleBtn = $("#sbExamSample");
    if (examSampleBtn) examSampleBtn.addEventListener("click", () => { input.value = EXAM_SAMPLE; });
    const examRealBtn = $("#sbExamReal");
    if (examRealBtn) examRealBtn.addEventListener("click", () => { input.value = REAL_EXAM_2024_2025; });
    clearBtn.addEventListener("click", () => {
      input.value = ""; QUESTIONS = []; resultEl.classList.add("hidden");
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    });
    genBtn.addEventListener("click", genMock);
    if (genRawBtn) genRawBtn.addEventListener("click", () => genMockRaw());
    saveBtn.addEventListener("click", () => save(false));
    printBtn.addEventListener("click", () => window.print());
    $$("input[name='sbbasis']").forEach(r => r.addEventListener("change", () => {
      const focus = $("input[name='sbbasis']:checked").value === "focus";
      kpFilterEl.classList.toggle("hidden", !focus);
      if (focus) renderKpFilter();
    }));

    load();
  })();

})();
