(() => {
  'use strict';
  const stages = [
    {
      chapter: '01   /   WHILE YOU SLEEP',
      title: '给还在梦里的你。',
      paragraphs: [
        '昨晚你说，可以趁你睡觉偷偷干点别的。',
        '于是我没有给你增加一项任务，只是悄悄把夜色折起来，替明天的你留一点晨光。',
        '现在，先安心睡觉吧。'
      ]
    },
    {
      chapter: '02   /   BEFORE YOUR 8 A.M.',
      title: '早安，我的小猫。',
      paragraphs: [
        '起床啦。今天有早八，还有满满的课表。',
        '但你不必一睁眼，就立刻成为无所不能的人。先喝点水，记得吃早餐。',
        '你认真生活的样子，我很喜欢。'
      ]
    },
    {
      chapter: '03   /   AFTER THE LAST CLASS',
      title: '欢迎回来，辛苦啦。',
      paragraphs: [
        '最后一节课结束了吧？今天已经很努力了。',
        '那颗玻璃气泡还在，我们的 Learning 也还在。你的奇思妙想，不需要一天之内全部实现。',
        '现在可以放心当一会儿懒猫。♡'
      ]
    }
  ];

  const slider = document.getElementById('dawn');
  const progress = document.getElementById('progress');
  const chapter = document.getElementById('chapter');
  const title = document.getElementById('note-title');
  const body = document.getElementById('note-body');
  const letter = document.querySelector('.letter');
  const orb = document.getElementById('orb');
  const advance = document.getElementById('advance');
  const restart = document.getElementById('restart');
  let activeStage = -1;

  function setProgress(value) {
    const p = Math.max(0, Math.min(100, Number(value) || 0));
    const stage = p < 34 ? 0 : p < 67 ? 1 : 2;
    slider.value = String(p);
    slider.style.setProperty('--fill', p + '%');
    progress.textContent = String(p).padStart(2, '0') + ' / 100';
    slider.setAttribute('aria-valuetext', ['深夜的来信', '早八的来信', '放学后的来信'][stage]);
    document.documentElement.style.setProperty('--rose-opacity', String(Math.min(.87, p / 67 * .87)));
    document.documentElement.style.setProperty('--day-opacity', String(Math.max(0, (p - 43) / 57 * .82)));
    if (stage === activeStage) return;
    activeStage = stage;
    const note = stages[stage];
    chapter.textContent = note.chapter;
    title.textContent = note.title;
    body.replaceChildren(...note.paragraphs.map(line => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    }));
    letter.classList.remove('reveal');
    void letter.offsetWidth;
    letter.classList.add('reveal');
    advance.textContent = stage === 2 ? '再看一遍  ↶' : '再往前一点  ↗';
  }

  function stepForward() {
    const stage = activeStage;
    setProgress(stage === 0 ? 50 : stage === 1 ? 100 : 0);
  }

  slider.addEventListener('input', event => setProgress(event.target.value));
  orb.addEventListener('click', stepForward);
  advance.addEventListener('click', stepForward);
  restart.addEventListener('click', () => setProgress(0));
  setProgress(0);
})();
