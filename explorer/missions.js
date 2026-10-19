/* Botball Explorer 2026-2027「Stack Attack」任務資料與計分邏輯（宣傳頁與計分模擬器共用）。
   分數與判定方式依 KIPR 官方任務頁 https://www.kipr.org/missioncontrol_pilot/botball_explorer_2027/（2026-10-19 核對）。
   KIPR 官方計分 App（score.html）的分數是舊版，不要拿來對照。 */
(function (root) {
  'use strict';

  // j：L＝即時判定（Live，裁判要看到發生），F＝終局判定（Final，比賽結束時看場上狀態）
  var MISSIONS = [
    { id: 1, en: 'Waypoint Alpha', zh: '航點 Alpha',
      skill: { zh: '基本自主導航與定點停車', en: 'Basic autonomous navigation and stopping at a specified location.' },
      stages: [
        { pts: 1, j: 'L', zh: '機器人進入左側起始框旁的區域，並在區域內明確停住。', en: 'A robot enters the zone next to the left starting box and comes to a clear, complete stop IN THE ZONE.' },
        { pts: 1, j: 'L', zh: '同一台機器人之後回到起始框，完全在框內並停住。', en: 'The same robot then returns FULLY WITHIN a starting box and comes to a clear, complete stop.' }
      ],
      note: { zh: 'Base 和 Bonus 要同一台機器人完成。跟 M10 各自獨立：回起始框一次，不能同時算 M1 和 M10 的 Bonus。', en: 'Base and Bonus must be done by the same robot. Independent of M10: one return to a starting box cannot score both Waypoint bonuses.' } },
    { id: 2, en: 'Relocate the Red Cube', zh: '移走紅色方塊',
      skill: { zh: '推移物體（推土）', en: 'Object displacement and bulldozing.' },
      stages: [
        { pts: 1, j: 'L', zh: '大紅方塊和它的托盤都離開黑線。', en: 'The Large Red Cube and its pallet are both OFF the black line.' },
        { pts: 3, j: 'L', zh: '兩個小紅方塊都離開黑線（不必維持疊著）。', en: 'Both Small Red Cubes are OFF the black line (they need not stay stacked).' }
      ],
      note: { zh: '大紅方塊和托盤分開判定，兩個都要離開黑線。', en: 'The Large Red Cube and the pallet are judged separately; both must be OFF.' } },
    { id: 3, en: 'Mixed Freight', zh: '混色貨物',
      skill: { zh: '物體操作、精準放置與堆疊', en: 'Object manipulation, placement accuracy, and stacking.' },
      stages: [
        { pts: 7, j: 'L', zh: '疊出一疊：綠方塊在黃方塊上，或黃方塊在綠方塊上。', en: 'Create one stack: a Green Cube ON TOP OF a Yellow Cube, or Yellow on Green.' },
        { pts: 9, j: 'L', zh: '再疊出第二疊綠黃混色。', en: 'Create a second stack of a Green and a Yellow Cube.' },
        { pts: 13, j: 'L', zh: '兩疊顏色順序相反：一疊綠在黃上、一疊黃在綠上。', en: 'The two stacks have opposite arrangements: one Green on Yellow, one Yellow on Green.' }
      ],
      note: { zh: '同色相疊不算；每個方塊只能算在一疊；三個疊成一疊不算兩疊。', en: 'Same-color stacks do not score; each cube counts in one stack only; a three-cube stack is not two stacks.' } },
    { id: 4, en: 'Remove the Hazard', zh: '移除危險物',
      skill: { zh: '推移與操作物體、同時完成條件', en: 'Object displacement, manipulation, and simultaneous task completion.' },
      stages: [
        { pts: 3, j: 'L', zh: '一顆橘色絨球離開黑線。', en: 'An Orange Pom is OFF the black line.' },
        { pts: 5, j: 'L', zh: '一顆橘色和一顆藍色絨球「同時」離開黑線。', en: 'An Orange Pom and a Blue Pom are SIMULTANEOUSLY OFF the line.' }
      ],
      note: { zh: '絨球得分後不必一直留在線外；先後各自離開不算 Bonus。', en: 'Poms need not stay OFF after scoring; leaving the line at different moments does not score the Bonus.' } },
    { id: 5, en: 'Top Shelf Delivery', zh: '頂層上架',
      skill: { zh: '物體操作、垂直放置與末端夾具設計', en: 'Object manipulation, vertical placement, and end-effector design.' },
      stages: [
        { pts: 9, j: 'L', zh: '一個小紅方塊在大紅方塊上面。', en: 'A Small Red Cube is ON TOP OF the Large Red Cube.' },
        { pts: 11, j: 'L', zh: '兩個小紅方塊同時在大紅方塊上面。', en: 'Both Small Red Cubes are ON TOP OF the Large Red Cube at the same time.' }
      ],
      note: { zh: '機器人扶著也算；得分後掉下來不影響已得分數。', en: 'Robot support is allowed; cubes may fall off after scoring.' } },
    { id: 6, en: 'Pallet Builder', zh: '托盤裝貨',
      skill: { zh: '多物體操作、空間推理與托盤運輸', en: 'Multi-object manipulation, spatial reasoning, and palletized transport.' },
      stages: [
        { pts: 15, j: 'L', zh: '4 個綠、黃方塊全部放上同一個托盤（疊在托盤上的方塊上面也算）。', en: 'All four Green and Yellow Cubes are on a single pallet (a cube ON TOP OF a cube on the pallet counts).' },
        { pts: 7, j: 'F', zh: '托盤完全在起始框內，且沒碰到黑線。', en: 'The pallet is FULLY WITHIN a starting box and not touching any black line.' }
      ],
      note: { zh: 'Base 得分後方塊可以掉下托盤；Bonus 看比賽結束時托盤的位置。', en: 'Cubes may leave the pallet after the Base scores; the Bonus is judged on the final pallet position.' } },
    { id: 7, en: 'Hazard Containment', zh: '危險物圍堵',
      skill: { zh: '抬起絨球並放進圍欄', en: 'Lifting poms and moving them into enclosures.' },
      stages: [
        { pts: 11, j: 'F', zh: '一顆藍色和一顆橘色絨球完全在同一個 PVC 圍欄內。', en: 'One Blue Pom and one Orange Pom are FULLY WITHIN the same PVC enclosure.' },
        { pts: 9, j: 'F', zh: '第二個 PVC 圍欄內也至少各有一顆藍、橘絨球。', en: 'A second PVC enclosure holds at least one Blue and one Orange Pom, each FULLY WITHIN.' }
      ],
      note: { zh: 'Base 和 Bonus 要用不同的圍欄。', en: 'Base and Bonus must use different enclosures.' } },
    { id: 8, en: 'Deliver the Red Cube', zh: '紅方塊送上碼頭',
      skill: { zh: '把托盤上的方塊抬上平台', en: 'Lifting palletized cubes up onto a platform.' },
      stages: [
        { pts: 11, j: 'F', zh: '載著大紅方塊的托盤在裝卸碼頭上面。', en: 'The pallet with the Large Red Cube is ON TOP OF the Loading Dock.' },
        { pts: 9, j: 'F', zh: '托盤在碼頭上時，至少一個小紅方塊在大紅方塊上面。', en: 'One or more Small Red Cubes are ON TOP OF the Large Red Cube while the pallet is on the Loading Dock.' }
      ],
      note: { zh: '大紅方塊掉下托盤、或沒有托盤只有方塊上碼頭，都不算。', en: 'Does not score if the Large Red Cube fell off the pallet, or reached the dock without the pallet.' } },
    { id: 9, en: 'Recover Botguy', zh: '救回 Botguy',
      skill: { zh: '導航到已知座標、取出重物', en: 'Navigating to a known coordinate and extracting a high-mass object.' },
      stages: [
        { pts: 7, j: 'L', zh: '機器人碰到 Botguy。', en: 'A robot is TOUCHING Botguy.' },
        { pts: 9, j: 'L', zh: 'Botguy 完全離開圍欄，同時碰到倉庫地面。', en: 'Botguy is COMPLETELY outside the enclosure AND touching the warehouse floor at the same moment.' }
      ],
      note: { zh: '機器人抓著 Botguy 碰到地面也算。', en: 'Botguy touching the floor while held by a robot still scores.' } },
    { id: 10, en: 'Waypoint Bravo', zh: '航點 Bravo',
      skill: { zh: '基本自主導航與定點停車', en: 'Basic autonomous navigation and stopping at a specified location.' },
      stages: [
        { pts: 1, j: 'L', zh: '機器人進入右側起始框（B 框）旁的區域，並在區域內明確停住。', en: 'A robot enters the zone next to the right starting box (Bravo) and comes to a clear, complete stop IN THE ZONE.' },
        { pts: 1, j: 'L', zh: '同一台機器人之後回到起始框，完全在框內並停住。', en: 'The same robot then returns FULLY WITHIN a starting box and comes to a clear, complete stop.' }
      ],
      note: { zh: 'Base 和 Bonus 要同一台機器人完成。跟 M1 各自獨立：回起始框一次，不能同時算兩個 Bonus。', en: 'Base and Bonus must be done by the same robot. Independent of M1: one return cannot score both Waypoint bonuses.' } },
    { id: 11, en: 'Hazard Disposal', zh: '危險物處理（橘）',
      skill: { zh: '精準駕駛與伺服馬達投放', en: 'Precise driving and servo movement for object delivery.' },
      stages: [
        { pts: 7, j: 'F', zh: '一顆橘色絨球在籃子裡。', en: 'One Orange Pom is IN a basket.' },
        { pts: 7, j: 'F', zh: '兩顆以上橘色絨球在同一個籃子裡。', en: 'Two or more Orange Poms are IN the same basket.' }
      ],
      note: { zh: '絨球部分伸進籃內就算「在裡面」。同時做 M11 和 M15，兩個任務要用不同的籃子。', en: 'A pom partly inside the basket counts as IN. If both M11 and M15 are attempted, each must use a different basket.' } },
    { id: 12, en: 'Restack the Freight', zh: '重新堆疊貨物',
      skill: { zh: '精準駕駛、把方塊疊起來', en: 'Precise driving and articulating cubes into a stack.' },
      stages: [
        { pts: 11, j: 'L', zh: '兩個散落方塊疊起來（面對面接觸，兩個都來自散落方塊區）。', en: 'One spilled cube is ON TOP OF another (flat face to flat face; both from the spilled cube area).' },
        { pts: 5, j: 'F', zh: '比賽結束時這疊還在，且下面的方塊碰到黑線。', en: 'The stack is still intact at the end and the lower cube is touching the black line.' }
      ],
      note: { zh: '架在兩個方塊邊緣上不算。疊在大綠方塊上可同時算 M16。', en: 'A cube balanced across edges does not count. A stack on the Large Green Cube can also score M16.' } },
    { id: 13, en: 'Rebuild the Shipment', zh: '重建貨運',
      skill: { zh: '推移與多物體堆疊', en: 'Bulldozing and multi-object stacking.' },
      stages: [
        { pts: 1, j: 'L', zh: '三個歪斜方塊都離開黑線。', en: 'All three Unstraight Cubes are OFF the black line.' },
        { pts: 7, j: 'L', zh: '兩個歪斜方塊疊起來。', en: 'One Unstraight Cube is ON TOP OF another.' },
        { pts: 13, j: 'F', zh: '比賽結束時三個歪斜方塊疊成一疊（直疊或金字塔都算）。', en: 'All three Unstraight Cubes form one scoring stack at the end (straight or pyramid).' }
      ],
      note: { zh: '只能用歪斜方塊區的方塊。疊在大棕方塊上可同時算 M17。', en: 'Only cubes from the Unstraight Cube area count. A stack on the Large Brown Cube can also score M17.' } },
    { id: 14, en: 'Traffic Control', zh: '交通管制',
      skill: { zh: '精準推移與運送', en: 'Precision bulldozing and object delivery.' },
      stages: [
        { pts: 3, j: 'L', zh: '兩個三角錐都離開黑線。', en: 'Both Traffic Cones are OFF the black line.' },
        { pts: 7, j: 'F', zh: '一個三角錐在裝載區內。', en: 'A Traffic Cone is IN the Loading Zone.' }
      ],
      note: { zh: '三角錐任何部分碰到線就不算離開。三角錐也可以算 M18。', en: 'A cone touching the line in any way is not OFF. The cones can also score M18.' } },
    { id: 15, en: 'Hazard Disposal #2', zh: '危險物處理 #2（藍）',
      skill: { zh: '精準駕駛與伺服馬達投放', en: 'Precise driving and servo movement for object delivery.' },
      stages: [
        { pts: 9, j: 'F', zh: '一顆藍色絨球在籃子裡。', en: 'One Blue Pom is IN a basket.' },
        { pts: 9, j: 'F', zh: '兩顆以上藍色絨球在同一個籃子裡。', en: 'Two or more Blue Poms are IN the same basket.' }
      ],
      note: { zh: '同時做 M11 和 M15，兩個任務要用不同的籃子。', en: 'If both M11 and M15 are attempted, each must use a different basket.' } },
    { id: 16, en: 'Freight Shelving', zh: '貨物上架',
      skill: { zh: '把小方塊放上高平台', en: 'Articulating a small cube onto a tall platform.' },
      stages: [
        { pts: 9, j: 'F', zh: '至少一個散落方塊在大綠方塊上面。', en: 'At least one cube from the Spilled Cube area is ON TOP OF the Large Green Cube.' },
        { pts: 11, j: 'F', zh: '兩個以上散落方塊在大綠方塊上面。', en: 'Two or more cubes from the Spilled Cube area are ON TOP OF the Large Green Cube.' }
      ],
      note: { zh: '疊在大綠方塊上另一個散落方塊上面也算；機器人扶著也算。可與 M12 同時得分。', en: 'A cube resting on another spilled cube on the Large Green Cube counts; robot support is allowed. Can score with M12.' } },
    { id: 17, en: 'Freight Racking', zh: '貨物上貨架',
      skill: { zh: '把小方塊放上高平台', en: 'Articulating a small cube onto a tall platform.' },
      stages: [
        { pts: 9, j: 'F', zh: '至少一個歪斜方塊在大棕方塊上面。', en: 'At least one cube from the Unstraight Cube area is ON TOP OF the Large Brown Cube.' },
        { pts: 11, j: 'F', zh: '兩個以上歪斜方塊在大棕方塊上面。', en: 'Two or more cubes from the Unstraight Cube area are ON TOP OF the Large Brown Cube.' }
      ],
      note: { zh: '疊在大棕方塊上另一個歪斜方塊上面也算；機器人扶著也算。可與 M13 同時得分。', en: 'A cube resting on another Unstraight Cube on the Large Brown Cube counts; robot support is allowed. Can score with M13.' } },
    { id: 18, en: 'Safety First, All Hands on Deck', zh: '安全第一，全員到齊',
      skill: { zh: '精準駕駛與伺服馬達、多物體運送', en: 'Precise driving and servo use for multi-object delivery.' },
      stages: [
        { pts: 11, j: 'F', zh: 'Botguy 在裝載區內。', en: 'Botguy is IN the Loading Zone.' },
        { pts: 13, j: 'F', zh: 'Botguy 在裝載區內，且至少一個三角錐完全在裝載區內。', en: 'Botguy is IN the Loading Zone AND at least one Traffic Cone is FULLY WITHIN it.' },
        { pts: 15, j: 'F', zh: 'Botguy 在裝載區內，且兩個三角錐都完全在裝載區內。', en: 'Botguy is IN the Loading Zone AND both Traffic Cones are FULLY WITHIN it.' }
      ],
      note: { zh: 'Botguy 和三角錐不必互相接觸。可與 M9（Botguy）、M14（三角錐）同時得分。', en: 'Botguy and the cones need not touch. Can score with M9 (Botguy) and M14 (cones).' } }
  ];

  // 同一個動作可同時得分的任務（規則書 Multi-Scoring Policy 列出的組合）
  var LINKS = { 2: [5, 8], 5: [2, 8], 8: [2, 5], 12: [16], 16: [12], 13: [17], 17: [13], 9: [18], 14: [18], 18: [9, 14] };
  // 互相限制的任務（Waypoint 各自獨立、籃子不能共用）
  var EXCLUSIVE = { 1: [10], 10: [1], 11: [15], 15: [11] };

  var STAGE_NAMES = ['Base', 'Bonus', 'Advanced'];
  var MATCH_SECONDS = 150;
  var TOUCH_PENALTY = 0.05;   // Discovery：每次碰觸扣該場成績 5%，累加，最低 0 分
  var TIMEOUT_CARDS = 2;      // Expedition：整場比賽（5 場合計）共 2 張暫停卡
  var MATCHES = 5, COUNTED = 4;

  function byId(id) {
    for (var i = 0; i < MISSIONS.length; i++) if (MISSIONS[i].id === id) return MISSIONS[i];
    return null;
  }
  function maxPts(m) {
    return m.stages.reduce(function (s, st) { return s + st.pts; }, 0);
  }
  var TOTAL_MAX = MISSIONS.reduce(function (s, m) { return s + maxPts(m); }, 0);

  function round2(x) { return Math.round(x * 100) / 100; }

  // earned[id] = 已完成到第幾階（0 無、1 Base、2 Bonus、3 Advanced）
  // phase：'live' 比賽中只能判定即時任務；'final' 比賽結束後可判定終局任務，也可修正即時任務
  function canToggle(m, level, earned, phase) {
    var cur = earned[m.id] || 0;
    if (level > m.stages.length) return false;
    if (cur >= level) return phase === 'final' || m.stages[level - 1].j === 'L';
    if (cur < level - 1) return false;           // 前一階沒拿到，這階還沒解鎖
    return phase === 'final' || m.stages[level - 1].j === 'L';
  }

  // 點已完成的階段＝取消它和之後的階段；點下一階＝完成它
  function toggle(earned, m, level, phase) {
    if (!canToggle(m, level, earned, phase)) return earned;
    var next = {};
    for (var k in earned) next[k] = earned[k];
    var cur = earned[m.id] || 0;
    next[m.id] = cur >= level ? level - 1 : level;
    return next;
  }

  function rawScore(declared, earned) {
    var total = 0;
    declared.forEach(function (id) {
      var m = byId(id), n = earned[id] || 0;
      for (var i = 0; i < n && i < m.stages.length; i++) total += m.stages[i].pts;
    });
    return total;
  }

  function matchScore(o) {
    var raw = rawScore(o.declared, o.earned);
    var pct = o.division === 'discovery' ? Math.min(1, (o.touches || 0) * TOUCH_PENALTY) : 0;
    var distinct = o.declared.filter(function (id) { return (o.earned[id] || 0) >= 1; }).length;
    return { raw: raw, penaltyPct: round2(pct * 100), final: round2(Math.max(0, raw * (1 - pct))), distinct: distinct };
  }

  // 5 場取最好 4 場；未滿 5 場時全部加總（最多 4 場）
  function tournament(matches) {
    var idx = matches.map(function (_, i) { return i; });
    idx.sort(function (a, b) { return matches[b].final - matches[a].final || a - b; });
    var counted = idx.slice(0, COUNTED);
    var dropped = matches.length > COUNTED ? idx.slice(COUNTED) : [];
    var total = round2(counted.reduce(function (s, i) { return s + matches[i].final; }, 0));
    var recoveries = matches.reduce(function (s, m) { return s + (m.touches || 0) + (m.timeouts || 0); }, 0);
    var rawTotal = counted.reduce(function (s, i) { return s + matches[i].raw; }, 0);
    var distinct = {};
    matches.forEach(function (m) { (m.scored || []).forEach(function (id) { distinct[id] = 1; }); });
    return { counted: counted, dropped: dropped, total: total, recoveries: recoveries, rawTotal: rawTotal, distinct: Object.keys(distinct).length };
  }

  var BE = {
    MISSIONS: MISSIONS, LINKS: LINKS, EXCLUSIVE: EXCLUSIVE, STAGE_NAMES: STAGE_NAMES,
    MATCH_SECONDS: MATCH_SECONDS, TOUCH_PENALTY: TOUCH_PENALTY, TIMEOUT_CARDS: TIMEOUT_CARDS,
    MATCHES: MATCHES, COUNTED: COUNTED, TOTAL_MAX: TOTAL_MAX,
    byId: byId, maxPts: maxPts, canToggle: canToggle, toggle: toggle,
    rawScore: rawScore, matchScore: matchScore, tournament: tournament
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BE;
  else root.BE = BE;
})(this);
