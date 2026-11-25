/* =====================================================================
   SysCHS · démo en ligne (GitHub Pages)
   Reproduit le fonctionnement de l'application Flask dans le navigateur :
   mêmes règles métier (services.py), mêmes écrans, données en localStorage.
   ===================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------ Configuration (= app/config.py)
  var CONFIG = {
    tariffs: { consultation: 35.0, chirurgie: 350.0 },
    slotHours: 2, dayStart: 8, dayEnd: 18,
    sysbillWeekday: 1, sysbillHour: 2,          // lundi 02:00
    password: 'demo1234'
  };
  var KEY = 'syschs-demo-v2';
  var ST = { REGISTERED: 'enregistre', READY: 'pret', DONE: 'termine' };
  var STATUS = {
    enregistre: ['En attente infirmier', 'wait'],
    pret: ['Prêt pour le médecin', 'ready'],
    termine: ['Terminé', 'done']
  };
  var ROLE_LABELS = { reception: 'Réception', nurse: 'Infirmerie', doctor: 'Médecin', admin: 'Facturation' };
  var ROLE_HOME = { reception: '#/reception', nurse: '#/nurse', doctor: '#/doctor', admin: '#/billing' };

  // ------------------------------------------------------------------ Utilitaires
  var ICONS = 'assets/icons.svg';
  function ic(name, cls) { return '<svg class="ico ' + (cls || '') + '" aria-hidden="true"><use href="' + ICONS + '#i-' + name + '"></use></svg>'; }
  function logo() { return '<svg aria-hidden="true"><use href="' + ICONS + '#i-logo"></use></svg>'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function D(v) { return v ? new Date(v) : null; }
  function iso(d) { return d.toISOString(); }
  function dt(v) { var d = D(v); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '—'; }
  function hm(v) { var d = D(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dm(v) { var d = D(v); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function ago(v) {
    if (!v) return '—';
    var m = Math.floor((Date.now() - D(v).getTime()) / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return 'il y a ' + m + ' min';
    if (m < 1440) return 'il y a ' + Math.floor(m / 60) + ' h ' + pad(m % 60);
    return dt(v).slice(0, 10);
  }
  function money(v) {
    var s = Number(v || 0).toFixed(3).split('.');
    return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '.' + s[1];
  }
  function initials(name) {
    var parts = String(name || '').replace('Dr.', '').split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(function (p) { return p[0]; }).join('') || '?').toUpperCase();
  }
  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 3) + '...' : s; }
  function hash(str) { // FNV-1a 32 bits (déterministe)
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  // ------------------------------------------------------------------ Code-barres Code 128 (jeu B)
  var C128 = ('11011001100,11001101100,11001100110,10010011000,10010001100,10001001100,10011001000,10011000100,10001100100,11001001000,11001000100,11000100100,10110011100,10011011100,10011001110,10111001100,10011101100,10011100110,11001110010,11001011100,11001001110,11011100100,11001110100,11101101110,11101001100,11100101100,11100100110,11101100100,11100110100,11100110010,11011011000,11011000110,11000110110,10100011000,10001011000,10001000110,10110001000,10001101000,10001100010,11010001000,11000101000,11000100010,10110111000,10110001110,10001101110,10111011000,10111000110,10001110110,11101110110,11010001110,11000101110,11011101000,11011100010,11011101110,11101011000,11101000110,11100010110,11101101000,11101100010,11100011010,11101111010,11001000010,11110001010,10100110000,10100001100,10010110000,10010000110,10000101100,10000100110,10110010000,10110000100,10011010000,10011000010,10000110100,10000110010,11000010010,11001010000,11110111010,11000010100,10001111010,10100111100,10010111100,10010011110,10111100100,10011110100,10011110010,11110100100,11110010100,11110010010,11011011110,11011110110,11110110110,10101111000,10100011110,10001011110,10111101000,10111100010,11110101000,11110100010,10111011110,10111101110,11101011110,11110101110,11010000100,11010010000,11010011100,11000111010').split(',');
  function barcodeSvg(text) {
    var vals = [104], sum = 104;
    for (var i = 0; i < text.length; i++) { var v = text.charCodeAt(i) - 32; vals.push(v); sum += v * (i + 1); }
    vals.push(sum % 103);
    var bits = vals.map(function (v) { return C128[v]; }).join('') + C128[106] + '11';
    var q = 10, mw = 2, h = 70, rects = '';
    for (var k = 0; k < bits.length;) {
      if (bits[k] === '1') { var j = k; while (bits[j] === '1') j++; rects += '<rect x="' + (q + k) * mw + '" y="6" width="' + (j - k) * mw + '" height="' + h + '"/>'; k = j; } else k++;
    }
    var W = (bits.length + 2 * q) * mw;
    return '<svg viewBox="0 0 ' + W + ' ' + (h + 30) + '" role="img" aria-label="' + esc(text) + '"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">' + rects +
      '</g><text x="' + W / 2 + '" y="' + (h + 25) + '" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="17">' + esc(text) + '</text></svg>';
  }

  // ------------------------------------------------------------------ Système externe CNSS (= cnss_client.py, mock)
  var FIRST = ['Ahmed', 'Mohamed', 'Sami', 'Youssef', 'Amine', 'Fatma', 'Salma', 'Mariem', 'Nour', 'Ines'];
  var LAST = ['Ben Salah', 'Trabelsi', 'Gharbi', 'Jlassi', 'Mansouri', 'Hammami', 'Bouazizi', 'Khelifi'];
  var CITIES = ['Nabeul', 'Sousse', 'Tunis', 'Hammamet', 'Sfax', 'Monastir'];
  function cnssValidate(card) {
    card = String(card || '').trim();
    if (!/^\d+$/.test(card) || card.length < 6) return { status: 'invalid', error: 'Numéro de carte invalide' };
    if (card[0] === '1') {
      var h = hash(card);
      return {
        status: 'valid', patient_data: {
          first_name: FIRST[h % FIRST.length], last_name: LAST[(h >>> 8) % LAST.length],
          address: ((h >>> 16) % 90 + 1) + ' rue de la République, ' + CITIES[(h >>> 4) % CITIES.length],
          phone: [20, 22, 50, 55, 98][(h >>> 12) % 5] + String((h % 900000) + 100000)
        }
      };
    }
    if (card[0] === '0') return { status: 'expired', error: 'Carte expirée : veuillez la renouveler' };
    return { status: 'invalid', error: 'Numéro de carte invalide' };
  }
  function cnssReceiveBill(payload) {
    var ref = (hash(payload.cnss_numbers.slice().sort().join(',')).toString(16) + hash(String(payload.bill_id)).toString(16)).slice(0, 10).toUpperCase();
    return { status: 'accepted', reference: 'CNSS-' + ref };
  }

  // ------------------------------------------------------------------ Base de données (localStorage)
  var db;
  function blank() {
    var users = [
      ['reception1', 'Salma Reception', 'reception'], ['nurse1', 'Nour Infirmière', 'nurse'],
      ['doctor1', 'Dr. Amine Gharbi', 'doctor'], ['doctor2', 'Dr. Ines Trabelsi', 'doctor'], ['admin', 'Administrateur', 'admin']
    ].map(function (u, i) { return { id: i + 1, username: u[0], full_name: u[1], role: u[2] }; });
    var rooms = [];
    for (var n = 101; n <= 110; n++) rooms.push({ id: n - 100, number: String(n) });
    return { seq: { patient: 0, dossier: 0, consultation: 0, surgery: 0, bill: 0, line: 0 }, users: users, rooms: rooms,
      patients: [], dossiers: [], consultations: [], surgeries: [], bills: [], lines: [], session: null };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* mode privé */ } }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function nextId(t) { db.seq[t] += 1; return db.seq[t]; }
  function byId(list, id) { id = Number(id); for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function user(id) { return byId(db.users, id); }
  function patient(id) { return byId(db.patients, id); }
  function room(id) { return byId(db.rooms, id); }
  function fullName(p) { return p.first_name + ' ' + p.last_name; }
  function dossierOf(p) { return db.dossiers.filter(function (d) { return d.patient_id === p.id; })[0] || null; }
  function surgeryOf(c) { return db.surgeries.filter(function (s) { return s.consultation_id === c.id; })[0] || null; }
  function currentUser() { return db.session ? user(db.session) : null; }

  // ------------------------------------------------------------------ Services (= services.py)
  function registerVisit(u, card, f) {
    var p = db.patients.filter(function (x) { return x.cnss_number === card; })[0];
    if (!p) { p = { id: nextId('patient'), cnss_number: card, created_at: iso(new Date()) }; db.patients.push(p); }
    p.first_name = f.first_name; p.last_name = f.last_name; p.address = f.address; p.phone = f.phone;
    var d = dossierOf(p);
    if (!d) { d = { id: nextId('dossier'), patient_id: p.id, barcode: 'SCH' + pad(p.id, 8), created_at: iso(new Date()) }; db.dossiers.push(d); }
    var c = { id: nextId('consultation'), patient_id: p.id, dossier_id: d.id, registered_by_id: u.id, status: ST.REGISTERED, created_at: iso(new Date()) };
    db.consultations.push(c);
    save();
    return c;
  }
  function findOpenByBarcode(code, status) {
    code = String(code || '').trim();
    var d = db.dossiers.filter(function (x) { return x.barcode === code; })[0];
    if (!d) { var p = db.patients.filter(function (x) { return x.cnss_number === code; })[0]; d = p ? dossierOf(p) : null; }
    if (!d) return null;
    return db.consultations.filter(function (c) { return c.dossier_id === d.id && c.status === status; })
      .sort(function (a, b) { return D(b.created_at) - D(a.created_at); })[0] || null;
  }
  function saveNurseEntry(c, nurse, details, notes) {
    if (c.status !== ST.REGISTERED) throw new Error("Cette consultation a déjà été traitée par l'infirmier.");
    if (!String(details).trim()) throw new Error("Les détails de l'ordonnance sont obligatoires.");
    c.prescription_details = details.trim(); c.nurse_notes = String(notes || '').trim() || null;
    c.nurse_id = nurse.id; c.nurse_at = iso(new Date()); c.status = ST.READY;
    save();
  }
  function bookSurgery(c, label, now) {
    now = now || new Date();
    var rooms = db.rooms.slice().sort(function (a, b) { return a.number.localeCompare(b.number); });
    var slot = CONFIG.slotHours * 3600000;
    var first = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, CONFIG.dayStart, 0, 0);
    for (var off = 0; off < 60; off++) {
      var dayStart = new Date(first.getFullYear(), first.getMonth(), first.getDate() + off, CONFIG.dayStart);
      var dayEnd = new Date(first.getFullYear(), first.getMonth(), first.getDate() + off, CONFIG.dayEnd);
      for (var start = dayStart.getTime(); start + slot <= dayEnd.getTime(); start += slot) {
        var end = start + slot;
        for (var r = 0; r < rooms.length; r++) {
          var clash = db.surgeries.some(function (s) { return s.room_id === rooms[r].id && D(s.start).getTime() < end && D(s.end).getTime() > start; });
          if (!clash) {
            var s = { id: nextId('surgery'), consultation_id: c.id, patient_id: c.patient_id, room_id: rooms[r].id, label: label, start: iso(new Date(start)), end: iso(new Date(end)) };
            db.surgeries.push(s);
            return s;
          }
        }
      }
    }
    throw new Error('Aucun créneau opératoire disponible dans les 60 prochains jours.');
  }
  function closeConsultation(c, doctor, f) {
    if (c.status !== ST.READY) throw new Error("La consultation n'est pas prête pour le médecin.");
    if (!String(f.diagnosis || '').trim()) throw new Error('Le diagnostic est obligatoire.');
    if (f.decision !== 'chirurgie' && f.decision !== 'medicament') throw new Error('Choisissez une décision : chirurgie ou médicaments.');
    if (f.decision === 'medicament' && !String(f.medication || '').trim()) throw new Error('Saisissez la nouvelle ordonnance.');
    var surgery = null;
    if (f.decision === 'chirurgie') surgery = bookSurgery(c, String(f.surgery_label || '').trim() || 'Intervention chirurgicale');
    c.diagnosis = f.diagnosis.trim(); c.decision = f.decision; c.doctor_id = doctor.id;
    c.closed_at = iso(new Date()); c.status = ST.DONE;
    c.act_type = f.decision === 'chirurgie' ? 'chirurgie' : 'consultation';
    if (f.decision === 'medicament') c.medication = f.medication.trim();
    save();
    return surgery;
  }
  function pendingActs() { return db.consultations.filter(function (c) { return c.status === ST.DONE && !c.bill_id; }); }
  function sendBill(b) {
    var resp = cnssReceiveBill({ bill_id: b.id, cnss_numbers: b.cnss_numbers });
    if (resp.status === 'accepted') { b.status = 'envoyee'; b.cnss_reference = resp.reference; } else b.status = 'echec';
    save();
    return b;
  }
  function runSysbill(now) {
    now = now || new Date();
    var pending = pendingActs().filter(function (c) { return D(c.closed_at) <= now; });
    if (!pending.length) return null;
    var numbers = {};
    pending.forEach(function (c) { numbers[patient(c.patient_id).cnss_number] = 1; });
    var b = { id: nextId('bill'), created_at: iso(now), period_end: iso(now), total_acts: pending.length,
      period_start: pending.map(function (c) { return c.closed_at; }).sort()[0], cnss_numbers: Object.keys(numbers).sort(), status: 'creee', cnss_reference: null };
    var per = {};
    pending.forEach(function (c) {
      var e = per[c.doctor_id] || (per[c.doctor_id] = [0, 0]);
      e[0] += 1; e[1] += CONFIG.tariffs[c.act_type]; c.bill_id = b.id;
    });
    b.total_amount = 0;
    Object.keys(per).forEach(function (did) {
      db.lines.push({ id: nextId('line'), bill_id: b.id, doctor_id: Number(did), act_count: per[did][0], amount: per[did][1] });
      b.total_amount += per[did][1];
    });
    db.bills.push(b);
    return sendBill(b);
  }
  function nextRun(now) {
    now = now || new Date();
    var r = new Date(now.getFullYear(), now.getMonth(), now.getDate(), CONFIG.sysbillHour, 0, 0);
    r.setDate(r.getDate() + ((CONFIG.sysbillWeekday - now.getDay() + 7) % 7));
    if (r <= now) r.setDate(r.getDate() + 7);
    return r;
  }

  // ------------------------------------------------------------------ Données de démonstration (= init_db.py --demo)
  function seedDemo() {
    db = blank();
    var demo = [
      ['1234567890', 'Ahmed', 'Ben Salah', '12 rue de la République, Nabeul', '20123456', 'chirurgie', ['Radio du genou droit', 'TA 12/8 · douleur 7/10', 'Rupture du ligament croisé antérieur', 'Ligamentoplastie du genou']],
      ['1555555555', 'Salma', 'Gharbi', '4 avenue Habib Bourguiba, Sousse', '55111222', 'medicament', ['Bilan sanguin complet', 'Fatigue, pâleur', 'Anémie ferriprive', 'Fer 80 mg : 1 cp/jour pendant 3 mois']],
      ['1987654321', 'Mariem', 'Trabelsi', '8 rue Ibn Khaldoun, Monastir', '98765432', 'medicament', ['Échographie abdominale', 'T° 37,8', 'Lithiase biliaire non compliquée', 'Antispasmodique si douleur, régime pauvre en graisses']],
      ['1122334455', 'Youssef', 'Jlassi', '21 rue de Marseille, Tunis', '22334455', 'pret', ['ECG + bilan lipidique', 'TA 15/9 · fréquence 88']],
      ['1777777777', 'Fatma', 'Hammami', '3 rue des Oliviers, Hammamet', '50777777', 'pret', ['Radio thorax', 'Toux depuis 10 jours']],
      ['1444444444', 'Sami', 'Mansouri', '17 rue de Kairouan, Sfax', '20444444', 'enregistre'],
      ['1666666666', 'Ines', 'Khelifi', '9 cité El Riadh, Sousse', '55666666', 'enregistre']
    ];
    var base = Date.now();
    demo.forEach(function (row, i) {
      var c = registerVisit(db.users[0], row[0], { first_name: row[1], last_name: row[2], address: row[3], phone: row[4] });
      var t0 = base - (95 - i * 12) * 60000;
      c.created_at = iso(new Date(t0));
      if (row[5] !== 'enregistre') { saveNurseEntry(c, db.users[1], row[6][0], row[6][1]); c.nurse_at = iso(new Date(t0 + 9 * 60000)); }
      if (row[5] === 'chirurgie' || row[5] === 'medicament') {
        closeConsultation(c, db.users[i % 2 === 0 ? 2 : 3], { diagnosis: row[6][2], decision: row[5],
          medication: row[5] === 'medicament' ? row[6][3] : '', surgery_label: row[5] === 'chirurgie' ? row[6][3] : '' });
        c.closed_at = iso(new Date(t0 + 23 * 60000));
      }
      if (i === 1) runSysbill();
    });
    save();
  }

  // ------------------------------------------------------------------ Composants (= _ui.html)
  function flowCounts() {
    return {
      registered: db.consultations.filter(function (c) { return c.status === ST.REGISTERED; }).length,
      ready: db.consultations.filter(function (c) { return c.status === ST.READY; }).length,
      unbilled: pendingActs().length
    };
  }
  function journey(active) {
    var f = flowCounts();
    var steps = [['reception', 'card', 'Réception', 'Validation CNSS', null], ['nurse', 'clipboard', 'Infirmerie', 'Saisie ordonnance', f.registered],
      ['doctor', 'stethoscope', 'Médecin', 'Diagnostic & décision', f.ready], ['admin', 'receipt', 'SysBill', 'Facturation CNSS', f.unbilled]];
    return '<div class="journey" aria-label="Circuit du patient">' + steps.map(function (s, i) {
      return '<div class="step ' + (s[0] === active ? 'on' : '') + '"><div class="n">' + ic(s[1], 'sm') + '</div><div><b>' + (i + 1) + '. ' + s[2] + '</b><span>' + s[3] + '</span></div>' +
        (s[4] === null ? '' : '<span class="q" title="Dossiers en attente à cette étape">' + s[4] + '</span>') + '</div>';
    }).join('') + '</div>';
  }
  function person(name, sub) { return '<div class="person"><span class="avatar">' + esc(initials(name)) + '</span><div><b>' + esc(name) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></div>'; }
  function empty(icon, title, text) { return '<div class="empty"><div class="eico">' + ic(icon, 'lg') + '</div><b>' + esc(title) + '</b>' + (text ? '<span class="small">' + esc(text) + '</span>' : '') + '</div>'; }
  function kpi(icon, value, label, tone, unit) { return '<div class="kpi"><div class="kico ' + (tone || '') + '">' + ic(icon, 'lg') + '</div><div><div class="val">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div><div class="lbl">' + label + '</div></div></div>'; }
  function badge(status) { var s = STATUS[status] || [status, '']; return '<span class="badge ' + s[1] + '">' + s[0] + '</span>'; }
  function head(eyebrowIcon, eyebrow, title, text, actions) {
    return '<div class="page-head"><div><div class="eyebrow">' + ic(eyebrowIcon, 'sm') + ' ' + eyebrow + '</div><h1>' + title + '</h1>' + (text ? '<p>' + text + '</p>' : '') + '</div>' + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  }
  function cardHead(icon, title, sub) { return '<div class="card-head"><span class="hico">' + ic(icon) + '</span><h2>' + title + '</h2>' + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</div>'; }
  function patientBanner(c, extraTag) {
    var p = patient(c.patient_id), d = byId(db.dossiers, c.dossier_id);
    return '<div class="card"><div class="patient-banner"><span class="avatar lg">' + esc(initials(fullName(p))) + '</span><div><h1>' + esc(fullName(p)) + '</h1><div class="ids">' +
      '<span class="tag">' + ic('card') + ' CNSS <span class="mono">' + esc(p.cnss_number) + '</span></span><span class="tag">' + ic('scan') + ' <span class="mono">' + esc(d.barcode) + '</span></span>' +
      (extraTag || '') + '</div></div><div class="right">' + badge(c.status) + '</div></div></div>';
  }

  // ------------------------------------------------------------------ Flash
  var flashes = [];
  function flash(msg, cat) { flashes.push([msg, cat || 'ok']); }
  function flashHtml(list) { return list.map(function (f) { return '<div class="flash ' + f[1] + '" role="alert">' + ic(f[1] === 'ok' ? 'check' : 'alert') + '<span>' + esc(f[0]) + '</span></div>'; }).join(''); }
  function showError(msg) {
    var content = document.querySelector('.content'); if (!content) return;
    var old = content.querySelector('.flash.error.live'); if (old) old.remove();
    content.insertAdjacentHTML('afterbegin', flashHtml([[msg, 'error']]).replace('class="flash error"', 'class="flash error live"'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ------------------------------------------------------------------ Mise en page (= base.html)
  function shell(page) {
    var u = currentUser(), role = u.role, f = flowCounts(), r = page.route || '';
    var nav = {
      reception: '<a href="#/reception" class="' + (/^reception(?!\/search)/.test(r) ? 'active' : '') + '">' + ic('user-plus') + ' Inscription patient</a>' +
        '<a href="#/reception/search" class="' + (r === 'reception/search' ? 'active' : '') + '">' + ic('search') + ' Localiser un patient</a>',
      nurse: '<a href="#/nurse" class="active">' + ic('clipboard') + ' Infirmerie <span class="count">' + f.registered + '</span></a>',
      doctor: '<a href="#/doctor" class="active">' + ic('stethoscope') + ' Consultations <span class="count">' + f.ready + '</span></a>',
      admin: '<a href="#/billing" class="active">' + ic('receipt') + ' Facturation CNSS <span class="count">' + f.unbilled + '</span></a>'
    }[role];
    function li(key, label, n) { return '<li class="' + (role === key ? 'on' : '') + '"><span class="dot"></span>' + label + (n === null ? '' : ' <b>' + n + '</b>') + '</li>'; }
    return '<div class="shell"><aside class="sidebar" id="sidebar">' +
      '<a class="logo" href="#/">' + logo() + '<span><b>SysCHS</b><small>CH Sahloul · Sousse</small></span></a>' +
      '<div class="nav-label">Espace ' + ROLE_LABELS[role] + '</div><nav class="nav">' + nav + '</nav>' +
      '<div class="flow"><h4>Circuit patient · en direct</h4><ol>' + li('reception', 'Réception', null) + li('nurse', 'Infirmerie', f.registered) + li('doctor', 'Médecin', f.ready) + li('admin', 'À facturer', f.unbilled) + '</ol></div>' +
      '<div class="side-user"><span class="avatar">' + esc(initials(u.full_name)) + '</span><div class="who"><b>' + esc(u.full_name) + '</b><span>' + ROLE_LABELS[role] + '</span></div>' +
      '<button class="icon-btn" type="button" data-action="logout" title="Déconnexion" aria-label="Déconnexion">' + ic('logout') + '</button></div></aside>' +
      '<div class="main">' + ribbon() +
      '<header class="topbar"><button class="icon-btn menu-btn" type="button" aria-label="Menu" data-action="menu">' + ic('menu') + '</button>' +
      '<div class="crumbs">' + page.crumbs + '</div><span class="spacer"></span>' +
      '<span class="chip hide-sm" title="Service de validation des cartes CNSS (simulé)"><span class="pulse"></span> CNSS connectée</span>' +
      '<span class="chip">' + ic('clock', 'sm') + ' <span id="clock"></span></span></header>' +
      '<main class="content">' + flashHtml(flashes) + page.html + '</main></div></div>';
  }
  function ribbon() {
    return '<div class="demo-ribbon no-print">' + ic('info', 'sm') + '<span><b>Démo en ligne</b> · données fictives enregistrées dans votre navigateur. La version complète tourne sur Flask + MySQL.</span>' +
      '<button type="button" data-action="reset">' + ic('refresh', 'sm') + ' Réinitialiser</button></div>';
  }
  function crumbs() {
    var parts = Array.prototype.slice.call(arguments), last = parts.pop();
    return parts.map(function (p) { return p[1] ? '<a href="' + p[1] + '">' + p[0] + '</a>' : p[0]; }).join(' ' + ic('chevron') + ' ') + (parts.length ? ' ' + ic('chevron') + ' ' : '') + '<strong>' + esc(last) + '</strong>';
  }

  // ------------------------------------------------------------------ Pages
  var lastRejected = null;
  var pages = {};

  pages.login = function () {
    var accounts = [['reception1', 'Réception', 'user-plus'], ['nurse1', 'Infirmier', 'clipboard'], ['doctor1', 'Médecin', 'stethoscope'], ['admin', 'Facturation', 'receipt']];
    return { raw: '<div class="auth-page"><section class="auth-hero">' +
      '<a class="logo" href="#/">' + logo() + '<span><b>SysCHS</b><small>Centre Hospitalier de Sahloul</small></span></a>' +
      '<h1>Le dossier patient, <em>de l\'accueil à la facturation CNSS.</em></h1>' +
      '<p>Un seul circuit numérique pour la réception, l\'infirmerie, les médecins et l\'administration : chaque dossier est identifié par code-barres et suit le patient à chaque étape.</p>' +
      '<svg class="ecg" viewBox="0 0 600 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 42 H140 l10 -6 l10 6 H210 l6 -30 l9 56 l9 -44 l6 18 H330 l14 -10 l14 10 H460 l6 -30 l9 56 l9 -44 l6 18 H600" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>' +
      '<div class="hero-steps"><div>' + ic('card') + '<b>Réception</b>Carte CNSS validée</div><div>' + ic('clipboard') + '<b>Infirmerie</b>Ordonnance saisie</div><div>' + ic('stethoscope') + '<b>Médecin</b>Diagnostic, bloc auto</div><div>' + ic('receipt') + '<b>SysBill</b>Facture hebdomadaire</div></div>' +
      '<div class="auth-foot">SysCHS · Projet d\'intégration · Démo en ligne (données fictives)</div></section>' +
      '<section class="auth-form"><div class="box"><h2>Connexion</h2><p>Identifiez-vous pour accéder à votre espace de travail.</p>' + flashHtml(flashes) +
      '<form data-form="login"><label for="username">Identifiant</label><div class="input-ico">' + ic('user') + '<input type="text" id="username" name="username" autocomplete="username" autofocus required></div>' +
      '<label for="password">Mot de passe</label><div class="input-ico">' + ic('lock') + '<input type="password" id="password" name="password" autocomplete="current-password" required></div>' +
      '<button type="submit">Se connecter ' + ic('arrow-right') + '</button></form>' +
      '<div class="demo-accounts"><h3>Comptes de démonstration · mot de passe demo1234</h3><div class="list">' +
      accounts.map(function (a) { return '<button type="button" data-login="' + a[0] + '">' + ic(a[2]) + '<span><b>' + a[1] + '</b><small>' + a[0] + '</small></span></button>'; }).join('') +
      '</div></div></div></section></div>' };
  };

  pages.reception = function () {
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var recent = db.consultations.slice().sort(function (a, b) { return D(b.created_at) - D(a.created_at); }).slice(0, 10);
    var upcoming = db.surgeries.filter(function (s) { return D(s.end) > now; }).sort(function (a, b) { return D(a.start) - D(b.start); });
    var busy = db.surgeries.filter(function (s) { return D(s.start) <= now && D(s.end) > now; }).length;
    var rows = recent.map(function (c) {
      var p = patient(c.patient_id), d = byId(db.dossiers, c.dossier_id);
      return '<tr><td>' + person(fullName(p), 'CNSS ' + p.cnss_number) + '</td><td class="hide-sm mono">' + esc(d.barcode) + '</td><td>' + badge(c.status) + '</td>' +
        '<td class="hide-sm muted small nowrap">' + ago(c.created_at) + '</td><td class="right"><a class="btn sm secondary" href="#/reception/labels/' + c.id + '">' + ic('printer') + ' Étiquettes</a></td></tr>';
    }).join('');
    var slots = upcoming.slice(0, 5).map(function (s) {
      return '<div class="slot"><div class="room"><small>CH.</small><b>' + esc(room(s.room_id).number) + '</b></div><div class="grow"><b>' + esc(fullName(patient(s.patient_id))) + '</b><small>' + esc(s.label) + '</small><br><small class="mono">' + dt(s.start) + ' → ' + hm(s.end) + '</small></div></div>';
    }).join('');
    return {
      route: 'reception', crumbs: crumbs(['Réception'], 'Inscription patient'),
      html: head('card', 'Phase 1 · Accueil', "Réception : inscription d'un patient", 'Scannez la carte CNSS : elle est validée en ligne avant toute ouverture de dossier.',
        '<a class="btn secondary" href="#/reception/search">' + ic('search') + ' Localiser un patient</a>') +
        journey('reception') +
        '<div class="kpis">' + kpi('user-plus', db.consultations.filter(function (c) { return D(c.created_at) >= today; }).length, "Inscriptions aujourd'hui") +
        kpi('users', db.patients.length, 'Patients enregistrés', 'ready') + kpi('scissors', upcoming.length, 'Interventions à venir', 'wait') +
        kpi('bed', db.rooms.length - busy, 'Chambres libres', 'done', '/ ' + db.rooms.length) + '</div>' +
        '<div class="grid-3"><div class="stack"><div class="card">' + cardHead('scan', '1. Scanner la carte CNSS', 'Étape 1 sur 3') +
        '<div class="card-body"><form data-form="cnss"><label for="cnss_number" class="sr-only">Numéro de la carte CNSS</label><div class="scan">' + ic('scan') +
        '<input type="text" id="cnss_number" name="cnss_number" inputmode="numeric" autocomplete="off" autofocus required placeholder="Numéro de la carte CNSS">' +
        '<button type="submit">' + ic('shield') + ' Valider auprès de la CNSS</button></div></form>' +
        '<div class="quick"><span>Simulation CNSS : un numéro commençant par 1 est valide, par 0 la carte est expirée. Essayer :</span>' +
        '<button type="button" data-fill="1234567890">1234567890</button><button type="button" data-fill="1313131313">1313131313</button><button type="button" data-fill="0123456789">0123456789</button><button type="button" data-fill="9999999">9999999</button></div></div></div>' +
        '<div class="card">' + cardHead('history', 'Dernières inscriptions', recent.length + ' affichées') + '<div class="card-body flush">' +
        (recent.length ? '<div class="table-wrap"><table><thead><tr><th>Patient</th><th class="hide-sm">Dossier</th><th>Statut</th><th class="hide-sm">Arrivée</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : empty('users', 'Aucune inscription pour le moment', 'Scannez une carte CNSS pour commencer.')) + '</div></div></div>' +
        '<div class="card">' + cardHead('calendar', 'Bloc opératoire', 'Prochaines interventions') + '<div class="card-body flush">' + (slots || empty('bed', 'Aucune intervention programmée')) + '</div></div></div>'
    };
  };

  pages.register = function (q) {
    var card = (q.card || '').trim(), res = cnssValidate(card);
    if (res.status !== 'valid') { lastRejected = { card: card, result: res }; return redirect('#/reception/rejected'); }
    var p = db.patients.filter(function (x) { return x.cnss_number === card; })[0];
    var data = p ? { first_name: p.first_name, last_name: p.last_name, address: p.address, phone: p.phone } : res.patient_data;
    var d = p ? dossierOf(p) : null;
    var title = p ? 'Mise à jour du profil patient' : 'Nouveau patient';
    return {
      route: 'reception/register', crumbs: crumbs(['Réception', '#/reception'], p ? 'Mise à jour du profil' : 'Nouveau patient'),
      html: head('user-plus', 'Phase 1 · Étape 2 sur 3', title, p ? 'Patient déjà connu : vérifiez et mettez à jour ses coordonnées.' : 'Première visite : les champs sont pré-remplis depuis la base CNSS.') +
        '<div class="grid-3"><div class="card">' + cardHead('user', 'Identité et coordonnées') + '<div class="card-body"><form data-form="register" data-card="' + esc(card) + '">' +
        '<div class="field-row"><div><label for="first_name" style="margin-top:0">Prénom</label><input type="text" id="first_name" name="first_name" value="' + esc(data.first_name) + '" required></div>' +
        '<div><label for="last_name" style="margin-top:0">Nom</label><input type="text" id="last_name" name="last_name" value="' + esc(data.last_name) + '" required></div></div>' +
        '<label for="address">Adresse</label><input type="text" id="address" name="address" value="' + esc(data.address) + '">' +
        '<label for="phone">Téléphone</label><input type="text" id="phone" name="phone" value="' + esc(data.phone) + '" inputmode="tel">' +
        '<div class="actions"><button type="submit">' + ic('printer') + ' Enregistrer et imprimer les étiquettes</button><a class="btn secondary" href="#/reception">Annuler</a></div></form></div></div>' +
        '<div class="card">' + cardHead('shield', 'Carte CNSS', '<span class="badge ok">valide</span>') + '<div class="card-body"><dl class="meta"><dt>Numéro</dt><dd class="mono">' + esc(card) + '</dd><dt>Statut</dt><dd>Validée en ligne</dd>' +
        '<dt>Dossier</dt><dd>' + (d ? '<span class="mono">' + esc(d.barcode) + '</span>' : "créé à l'enregistrement") + '</dd></dl>' +
        (p ? '' : '<p class="hint">' + ic('info', 'sm') + ' Première visite : champs pré-remplis depuis la CNSS.</p>') + '</div></div></div>'
    };
  };

  pages.rejected = function () {
    if (!lastRejected) return redirect('#/reception');
    var r = lastRejected.result;
    return {
      route: 'reception/rejected', crumbs: crumbs(['Réception', '#/reception'], 'Carte rejetée'),
      html: '<div class="card" style="max-width:640px"><div class="card-body" style="padding:2rem"><div class="empty" style="padding:0 0 1.2rem"><div class="eico" style="background:var(--err-bg);color:var(--err)">' + ic('x', 'lg') + '</div><h1>Carte CNSS rejetée</h1></div>' +
        flashHtml([[r.error || 'Validation impossible', 'error']]) +
        '<dl class="meta" style="margin-bottom:1rem"><dt>Numéro saisi</dt><dd class="mono">' + esc(lastRejected.card || '—') + '</dd><dt>Réponse CNSS</dt><dd>' + esc(r.status) + '</dd></dl>' +
        '<p>L\'inscription est interrompue. Demandez au patient de <strong>renouveler sa carte CNSS</strong>.</p>' +
        '<a class="btn" href="#/reception">' + ic('arrow-left') + ' Retour</a></div></div>'
    };
  };

  pages.labels = function (q, id) {
    var c = byId(db.consultations, id); if (!c) return notFound();
    var p = patient(c.patient_id), d = byId(db.dossiers, c.dossier_id);
    function label(title, svg, sub) {
      return '<div class="label-box"><div class="lh">' + logo() + ' ' + title + ' <span>CH Sahloul</span></div><div class="lb">' + svg + '<div class="lname">' + esc(fullName(p)) + '</div><div class="lsub">' + sub + '</div></div></div>';
    }
    return {
      route: 'reception/labels', crumbs: crumbs(['Réception', '#/reception'], 'Étiquettes code-barres'),
      html: '<div class="page-head no-print"><div><div class="eyebrow">' + ic('printer', 'sm') + ' Phase 1 · Étape 3 sur 3</div><h1>Étiquettes code-barres</h1><p>Patient : <strong>' + esc(fullName(p)) + '</strong>. Imprimez les deux étiquettes puis collez-les sur la chemise et au dos de la carte CNSS.</p></div>' +
        '<div class="actions"><button type="button" data-action="print">' + ic('printer') + ' Imprimer</button><a class="btn secondary" href="#/reception">Patient suivant ' + ic('arrow-right') + '</a></div></div>' +
        '<div class="flash ok no-print">' + ic('check') + '<span>Inscription enregistrée : le patient est transmis à l\'infirmerie.</span></div>' +
        '<div class="labels">' + label('Dossier médical', barcodeSvg(d.barcode), 'Chemise · ' + dt(c.created_at)) + label('Dos de la carte CNSS', barcodeSvg(p.cnss_number), 'Carte CNSS · ' + esc(p.cnss_number)) + '</div>'
    };
  };

  pages.search = function (q) {
    var term = (q.q || '').trim(), results = [];
    if (term) {
      var low = term.toLowerCase();
      db.patients.forEach(function (p) {
        var d = dossierOf(p);
        if (p.last_name.toLowerCase().indexOf(low) >= 0 || p.first_name.toLowerCase().indexOf(low) >= 0 || p.cnss_number === term || (d && d.barcode === term)) {
          var s = db.surgeries.filter(function (x) { return x.patient_id === p.id; }).sort(function (a, b) { return D(b.start) - D(a.start); })[0];
          results.push([p, s]);
        }
      });
    }
    var rows = results.slice(0, 20).map(function (r) {
      var p = r[0], s = r[1], d = dossierOf(p);
      return '<tr><td>' + person(fullName(p), p.phone) + '</td><td class="mono">' + esc(p.cnss_number) + '</td><td class="hide-sm mono">' + (d ? esc(d.barcode) : '—') + '</td><td>' +
        (s ? '<div class="slot" style="padding:0;border:0"><div class="room"><small>CH.</small><b>' + esc(room(s.room_id).number) + '</b></div><div class="grow"><b>Chambre ' + esc(room(s.room_id).number) + '</b><small>' + dt(s.start) + ' – ' + hm(s.end) + ' · ' + esc(s.label) + '</small></div></div>'
          : '<span class="muted">Aucune intervention programmée</span>') + '</td></tr>';
    }).join('');
    return {
      route: 'reception/search', crumbs: crumbs(['Réception'], 'Localiser un patient'),
      html: head('search', 'Réception', 'Localiser un patient', 'Retrouvez un patient et la chambre de son intervention pour orienter sa famille.') +
        '<div class="card"><div class="card-body"><form data-form="search"><label for="q" class="sr-only">Recherche</label><div class="scan">' + ic('search') +
        '<input type="search" id="q" name="q" value="' + esc(term) + '" autofocus placeholder="Nom, prénom, N° CNSS ou code-barres du dossier" style="font-family:var(--font);letter-spacing:0;font-size:1rem"><button type="submit">Rechercher</button></div></form>' +
        '<div class="quick"><span>Essayer :</span><button type="button" data-search="Ben Salah">Ben Salah</button><button type="button" data-search="SCH00000002">SCH00000002</button></div></div></div>' +
        (term ? '<div class="card">' + cardHead('users', 'Résultats', results.length + ' pour « ' + esc(term) + ' »') + '<div class="card-body flush">' +
          (results.length ? '<div class="table-wrap"><table><thead><tr><th>Patient</th><th>N° CNSS</th><th class="hide-sm">Dossier</th><th>Chambre / créneau</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
            : empty('search', 'Aucun résultat', 'Vérifiez l\'orthographe ou scannez le code-barres du dossier.')) + '</div></div>' : '')
    };
  };

  pages.nurse = function () {
    var me = currentUser(), now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var waiting = db.consultations.filter(function (c) { return c.status === ST.REGISTERED; }).sort(function (a, b) { return D(a.created_at) - D(b.created_at); });
    var doneToday = db.consultations.filter(function (c) { return c.nurse_id === me.id && D(c.nurse_at) >= today; }).length;
    var list = waiting.map(function (c, i) {
      var p = patient(c.patient_id), d = byId(db.dossiers, c.dossier_id);
      return '<li><span class="rank">' + pad(i + 1) + '</span><span class="avatar">' + esc(initials(fullName(p))) + '</span><div class="grow"><b>' + esc(fullName(p)) + '</b><small><span class="mono">' + esc(d.barcode) + '</span> · arrivé ' + ago(c.created_at) + '</small></div>' +
        '<span class="badge wait hide-sm">En attente</span><a class="btn sm" href="#/nurse/consultation/' + c.id + '">Ouvrir</a></li>';
    }).join('');
    return {
      route: 'nurse', crumbs: crumbs(['Infirmerie'], 'Saisie des ordonnances'),
      html: head('clipboard', 'Phase 2 · Infirmerie', 'Infirmerie : saisie des ordonnances', 'Scannez la chemise du patient (ou le dos de sa carte CNSS) pour ouvrir son dossier.') + journey('nurse') +
        '<div class="kpis">' + kpi('users', waiting.length, 'Patients en attente', 'wait') + kpi('check', doneToday, "Saisies effectuées aujourd'hui", 'done') + kpi('stethoscope', flowCounts().ready, 'Transmis au médecin', 'ready') + '</div>' +
        '<div class="card">' + cardHead('scan', 'Scanner le dossier du patient') + '<div class="card-body"><form data-form="scan"><label for="barcode" class="sr-only">Code-barres</label><div class="scan">' + ic('scan') +
        '<input type="text" id="barcode" name="barcode" autocomplete="off" autofocus required placeholder="ex. SCH00000006"><button type="submit">Ouvrir le dossier ' + ic('arrow-right') + '</button></div></form>' +
        (waiting.length ? '<div class="quick"><span>Simuler un scan :</span>' + waiting.slice(0, 3).map(function (c) { var b = byId(db.dossiers, c.dossier_id).barcode; return '<button type="button" data-fill-scan="' + b + '">' + b + '</button>'; }).join('') + '</div>' : '') + '</div></div>' +
        '<div class="card">' + cardHead('clock', 'Patients en attente (' + waiting.length + ')', "Ordre d'arrivée") + '<div class="card-body flush">' +
        (waiting.length ? '<ul class="queue">' + list + '</ul>' : empty('check', 'Personne en attente.', 'Les nouveaux patients apparaîtront ici dès leur inscription.')) + '</div></div>'
    };
  };

  pages.nurseConsultation = function (q, id) {
    var c = byId(db.consultations, id); if (!c) return notFound();
    var p = patient(c.patient_id);
    var extra = (p.phone ? '<span class="tag">' + esc(p.phone) + '</span>' : '') + (p.address ? '<span class="tag">' + esc(p.address) + '</span>' : '');
    return {
      route: 'nurse/consultation', crumbs: crumbs(['Infirmerie', '#/nurse'], fullName(p)),
      html: patientBanner(c, extra) + (c.status === ST.REGISTERED
        ? '<div class="card">' + cardHead('file', 'Ordonnance du médecin') + '<div class="card-body"><p class="muted">Joignez l\'ordonnance papier à la chemise, puis saisissez son contenu.</p>' +
          '<form data-form="nurse" data-id="' + c.id + '"><label for="prescription_details">Détails de l\'ordonnance</label><textarea id="prescription_details" name="prescription_details" required autofocus placeholder="Examens, médicaments prescrits, posologie…"></textarea>' +
          '<label for="nurse_notes">Notes de l\'infirmier (constantes, observations)</label><textarea id="nurse_notes" name="nurse_notes" placeholder="TA, température, poids, observations…"></textarea>' +
          '<div class="actions"><button type="submit">' + ic('send') + ' Enregistrer et transmettre au médecin</button><a class="btn secondary" href="#/nurse">Annuler</a></div></form></div></div>'
        : '<div class="card"><div class="card-body">' + empty('check', 'Cette consultation a déjà été traitée.', 'Statut actuel : ' + STATUS[c.status][0]) + '<div style="text-align:center"><a class="btn secondary" href="#/nurse">' + ic('arrow-left') + ' Retour</a></div></div></div>')
    };
  };

  pages.doctor = function () {
    var me = currentUser(), now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var waiting = db.consultations.filter(function (c) { return c.status === ST.READY; }).sort(function (a, b) { return D(a.nurse_at) - D(b.nurse_at); });
    var done = db.consultations.filter(function (c) { return c.status === ST.DONE && c.doctor_id === me.id; }).sort(function (a, b) { return D(b.closed_at) - D(a.closed_at); }).slice(0, 10);
    var todayCount = db.consultations.filter(function (c) { return c.doctor_id === me.id && D(c.closed_at) >= today; }).length;
    var surg = db.surgeries.filter(function (s) { var c = byId(db.consultations, s.consultation_id); return c && c.doctor_id === me.id && D(s.end) > now; }).length;
    return {
      route: 'doctor', crumbs: crumbs(['Médecin'], 'Consultations'),
      html: head('stethoscope', 'Phase 2 · Consultation', 'Bonjour, ' + esc(me.full_name), "Patients préparés par l'infirmerie, dans l'ordre où ils sont prêts.") + journey('doctor') +
        '<div class="kpis">' + kpi('users', waiting.length, 'Patients prêts', 'ready') + kpi('check', todayCount, "Consultations clôturées aujourd'hui", 'done') + kpi('scissors', surg, 'Mes interventions à venir', 'wait') + '</div>' +
        '<div class="grid-3"><div class="card">' + cardHead('clock', 'Patients prêts à être reçus (' + waiting.length + ')') + '<div class="card-body flush">' +
        (waiting.length ? '<ul class="queue">' + waiting.map(function (c, i) {
          var p = patient(c.patient_id);
          return '<li><span class="rank">' + pad(i + 1) + '</span><span class="avatar">' + esc(initials(fullName(p))) + '</span><div class="grow"><b>' + esc(fullName(p)) + '</b><small>Prêt ' + ago(c.nurse_at) + ' · ' + esc(truncate(c.prescription_details, 60)) + '</small></div>' +
            '<a class="btn sm" href="#/doctor/consultation/' + c.id + '">Recevoir ' + ic('arrow-right') + '</a></li>';
        }).join('') + '</ul>' : empty('check', 'Aucun patient en attente.', "Les patients apparaissent ici dès que l'infirmier a saisi l'ordonnance.")) + '</div></div>' +
        '<div class="card">' + cardHead('history', 'Mes dernières consultations') + '<div class="card-body flush">' +
        (done.length ? '<ul class="queue">' + done.map(function (c) {
          var p = patient(c.patient_id);
          return '<li><span class="avatar">' + esc(initials(fullName(p))) + '</span><div class="grow"><b>' + esc(fullName(p)) + '</b><small>' + dt(c.closed_at) + ' · ' + (c.decision === 'chirurgie' ? 'Chirurgie' : 'Médicaments') + '</small></div>' +
            '<a class="btn sm ghost" href="#/doctor/summary/' + c.id + '" title="Document patient">' + ic('file') + '<span class="sr-only">Document patient</span></a></li>';
        }).join('') + '</ul>' : empty('file', 'Aucune consultation clôturée.', 'Connectez-vous avec doctor2 pour voir ses consultations.')) + '</div></div></div>'
    };
  };

  pages.doctorConsultation = function (q, id) {
    var c = byId(db.consultations, id); if (!c) return notFound();
    if (c.status === ST.DONE) return redirect('#/doctor/summary/' + c.id);
    var p = patient(c.patient_id), nurse = c.nurse_id ? user(c.nurse_id) : null;
    var history = db.consultations.filter(function (h) { return h.patient_id === p.id && h.id !== c.id && h.status === ST.DONE; }).sort(function (a, b) { return D(b.created_at) - D(a.created_at); });
    return {
      route: 'doctor/consultation', crumbs: crumbs(['Consultations', '#/doctor'], fullName(p)),
      html: patientBanner(c, '<span class="tag">' + ic('history') + ' ' + history.length + ' visite(s) antérieure(s)</span>') +
        '<div class="grid"><div class="card">' + cardHead('clipboard', "Saisie de l'infirmier", dt(c.nurse_at)) + '<div class="card-body"><h3>Ordonnance</h3><div class="note">' + esc(c.prescription_details || '—') + '</div>' +
        (c.nurse_notes ? '<h3>Notes</h3><div class="note">' + esc(c.nurse_notes) + '</div>' : '') + '<p class="muted small">Par ' + esc(nurse ? nurse.full_name : '—') + '</p></div></div>' +
        '<div class="card">' + cardHead('history', 'Historique médical') + '<div class="card-body">' +
        (history.length ? '<ul class="timeline">' + history.map(function (h) {
          var doc = h.doctor_id ? user(h.doctor_id) : null;
          return '<li><div class="when">' + dt(h.closed_at) + ' · ' + esc(doc ? doc.full_name : '') + '</div><b>Diagnostic : ' + esc(h.diagnosis) + '</b><div class="muted small">' + (h.decision === 'chirurgie' ? 'Chirurgie programmée' : 'Médicaments : ' + esc(h.medication)) + '</div></li>';
        }).join('') + '</ul>' : empty('history', 'Première consultation enregistrée.')) + '</div></div></div>' +
        '<div class="card">' + cardHead('stethoscope', 'Diagnostic et décision') + '<div class="card-body"><form data-form="doctor" data-id="' + c.id + '">' +
        '<label for="diagnosis" style="margin-top:0">Diagnostic</label><textarea id="diagnosis" name="diagnosis" required></textarea><label>Décision</label><div class="choices">' +
        '<label class="choice checked"><input type="radio" name="decision" value="medicament" checked><span class="cico">' + ic('pill') + '</span><span><b>Traitement médicamenteux</b><span>Nouvelle ordonnance remise au patient</span></span></label>' +
        '<label class="choice"><input type="radio" name="decision" value="chirurgie"><span class="cico">' + ic('scissors') + '</span><span><b>Intervention chirurgicale</b><span>Chambre et créneau attribués automatiquement</span></span></label></div>' +
        '<div id="med"><label for="medication">Nouvelle ordonnance</label><textarea id="medication" name="medication"></textarea></div>' +
        '<div id="surg" hidden><label for="surgery_label">Intervention</label><input type="text" id="surgery_label" name="surgery_label" placeholder="ex. Appendicectomie">' +
        '<p class="hint">' + ic('info', 'sm') + ' SysCHS réserve la première chambre libre au premier créneau disponible (dès demain, 08:00–18:00).</p></div>' +
        '<button type="submit">' + ic('printer') + ' Valider et imprimer le document patient</button></form></div></div>'
    };
  };

  pages.summary = function (q, id) {
    var c = byId(db.consultations, id); if (!c || c.status !== ST.DONE) return notFound();
    var p = patient(c.patient_id), d = byId(db.dossiers, c.dossier_id), doc = user(c.doctor_id), s = surgeryOf(c);
    return {
      route: 'doctor/summary', crumbs: crumbs(['Consultations', '#/doctor'], 'Document patient'),
      html: '<div class="actions no-print" style="margin:-1.1rem 0 1.2rem"><button type="button" data-action="print">' + ic('printer') + ' Imprimer</button><a class="btn secondary" href="#/doctor">Patient suivant ' + ic('arrow-right') + '</a></div>' +
        '<article class="print-doc"><header class="letterhead">' + logo() + '<div><b>Centre Hospitalier de Sahloul</b><small>Sousse · Système d\'information SysCHS</small></div><div class="ref">Consultation n° ' + pad(c.id, 6) + '<br>' + dt(c.closed_at) + '</div></header>' +
        '<h1>Compte rendu de visite</h1><dl class="meta"><dt>Patient</dt><dd>' + esc(fullName(p)) + '</dd><dt>N° CNSS</dt><dd class="mono">' + esc(p.cnss_number) + '</dd><dt>Dossier</dt><dd class="mono">' + esc(d.barcode) + '</dd>' +
        '<dt>Date</dt><dd>' + dt(c.closed_at) + '</dd><dt>Médecin</dt><dd>' + esc(doc.full_name) + '</dd></dl><h2>Diagnostic</h2><p>' + esc(c.diagnosis) + '</p>' +
        (c.decision === 'chirurgie' && s
          ? '<h2>Intervention programmée</h2><div class="callout"><div class="big">Chambre ' + esc(room(s.room_id).number) + '</div><div><b>' + esc(s.label) + '</b><br>le ' + dt(s.start) + " (jusqu'à " + hm(s.end) + ')</div></div>'
          : '<h2>Ordonnance</h2><p style="white-space:pre-line">' + esc(c.medication) + '</p>') +
        '<div class="sign"><div>Signature et cachet<br><b>' + esc(doc.full_name) + '</b></div></div></article>'
    };
  };

  pages.billing = function () {
    var pending = pendingActs(), bills = db.bills.slice().sort(function (a, b) { return D(b.created_at) - D(a.created_at); });
    var pendingAmount = pending.reduce(function (s, c) { return s + CONFIG.tariffs[c.act_type]; }, 0);
    var billed = bills.filter(function (b) { return b.status === 'envoyee'; }).reduce(function (s, b) { return s + b.total_amount; }, 0);
    var failed = bills.filter(function (b) { return b.status !== 'envoyee'; }).length;
    var rows = bills.map(function (b) {
      var ok = b.status === 'envoyee';
      return '<tr><td class="mono"><b>#' + pad(b.id, 4) + '</b></td><td>' + dt(b.created_at) + '</td><td class="hide-sm muted small">' + dm(b.period_start) + ' → ' + dt(b.period_end).slice(0, 10) + '</td>' +
        '<td class="right">' + b.total_acts + '</td><td class="right mono">' + money(b.total_amount) + '</td><td><span class="badge ' + (ok ? 'ok' : 'err') + '">' + (ok ? 'envoyée' : esc(b.status)) + '</span></td>' +
        '<td class="right"><a class="btn sm secondary" href="#/billing/' + b.id + '">Détail</a></td></tr>';
    }).join('');
    return {
      route: 'billing', crumbs: crumbs(['Administration'], 'Facturation CNSS'),
      html: head('receipt', 'Phase 3 · SysBill', 'SysBill : facturation CNSS', 'Les actes terminés sont regroupés chaque semaine en une facture envoyée à la CNSS.') + journey('admin') +
        '<div class="kpis">' + kpi('clipboard', pending.length, 'Actes en attente de facturation', 'wait') + kpi('wallet', money(pendingAmount), 'Montant à facturer', 'ready', 'TND') +
        kpi('check', money(billed), 'Total facturé à la CNSS', 'done', 'TND') + kpi(failed ? 'alert' : 'shield', failed, 'Factures en échec', failed ? 'err' : '') + '</div>' +
        '<div class="card"><div class="card-body run-box"><span class="hico" style="width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:var(--brand-50);color:var(--brand)">' + ic('refresh', 'lg') + '</span>' +
        '<div><b>SysBill s\'exécute automatiquement chaque semaine.</b><div class="muted small">Prochaine exécution : ' + dt(nextRun()) + ' · Tarifs : consultation ' + money(CONFIG.tariffs.consultation) + ' TND · chirurgie ' + money(CONFIG.tariffs.chirurgie) +
        ' TND. Actes terminés en attente de facturation : <strong>' + pending.length + '</strong></div></div>' +
        '<form data-form="sysbill"><button type="submit"' + (pending.length ? '' : ' disabled') + '>' + ic('play') + ' Lancer SysBill maintenant</button></form></div></div>' +
        '<div class="card">' + cardHead('receipt', 'Factures', bills.length + ' au total') + '<div class="card-body flush">' +
        (bills.length ? '<div class="table-wrap"><table><thead><tr><th>N°</th><th>Générée</th><th class="hide-sm">Période</th><th class="right">Actes</th><th class="right">Montant (TND)</th><th>Statut</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : empty('receipt', 'Aucune facture.', 'La première facture sera générée à la prochaine exécution de SysBill.')) + '</div></div>'
    };
  };

  pages.bill = function (q, id) {
    var b = byId(db.bills, id); if (!b) return notFound();
    var lines = db.lines.filter(function (l) { return l.bill_id === b.id; }), ok = b.status === 'envoyee';
    var maxv = Math.max.apply(null, lines.map(function (l) { return l.amount; }).concat([1]));
    return {
      route: 'billing/detail', crumbs: crumbs(['Facturation CNSS', '#/billing'], 'Facture n°' + b.id),
      html: head('receipt', 'SysBill', 'Facture n°' + b.id, 'Période du ' + dt(b.period_start) + ' au ' + dt(b.period_end),
        (ok ? '' : '<button type="button" data-action="retry" data-id="' + b.id + '" style="margin:0">' + ic('send') + ' Renvoyer à la CNSS</button>') +
        '<button type="button" class="secondary" style="margin:0" data-action="print">' + ic('printer') + ' Imprimer</button>') +
        '<div class="kpis">' + kpi('clipboard', b.total_acts, 'Actes facturés') + kpi('wallet', money(b.total_amount), 'Montant total', 'ready', 'TND') +
        '<div class="kpi"><div class="kico ' + (ok ? 'done' : 'err') + '">' + ic(ok ? 'send' : 'alert', 'lg') + '</div><div><div class="val" style="font-size:1.05rem"><span class="badge ' + (ok ? 'ok' : 'err') + '">' + (ok ? 'envoyée' : esc(b.status)) + '</span></div>' +
        '<div class="lbl">' + (b.cnss_reference ? 'Référence CNSS : <span class="mono">' + esc(b.cnss_reference) + '</span>' : 'Non transmise') + '</div></div></div></div>' +
        '<div class="grid-3"><div class="card">' + cardHead('stethoscope', 'Rémunération des médecins') + '<div class="card-body flush"><div class="table-wrap"><table><thead><tr><th>Médecin</th><th class="right">Actes</th><th class="hide-sm" style="width:30%"></th><th class="right">Montant (TND)</th></tr></thead><tbody>' +
        lines.map(function (l) { return '<tr><td>' + person(user(l.doctor_id).full_name) + '</td><td class="right">' + l.act_count + '</td><td class="hide-sm"><div class="bar"><i style="width:' + (l.amount / maxv * 100).toFixed(1) + '%"></i></div></td><td class="right mono">' + money(l.amount) + '</td></tr>'; }).join('') +
        '<tr class="total-row"><td>Total</td><td class="right">' + b.total_acts + '</td><td class="hide-sm"></td><td class="right mono">' + money(b.total_amount) + '</td></tr></tbody></table></div></div></div>' +
        '<div class="card">' + cardHead('card', 'Numéros CNSS traités') + '<div class="card-body"><div class="cnss-list">' + b.cnss_numbers.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div></div></div></div>' +
        '<a class="btn secondary no-print" href="#/billing">' + ic('arrow-left') + ' Retour</a>'
    };
  };

  function notFound() { return { route: '', crumbs: crumbs('Introuvable'), html: '<div class="card"><div class="card-body">' + empty('alert', 'Page introuvable', "Cet élément n'existe pas ou a été supprimé.") + '</div></div>' }; }
  function forbidden() { return { route: '', crumbs: crumbs('Accès refusé'), html: '<div class="card"><div class="card-body">' + empty('lock', 'Accès refusé (403)', 'Cette page est réservée à un autre rôle.') + '</div></div>' }; }
  function redirect(hash) { return { redirect: hash }; }

  // ------------------------------------------------------------------ Routeur
  var ROUTES = [
    [/^\/reception\/?$/, 'reception', pages.reception],
    [/^\/reception\/register$/, 'reception', pages.register],
    [/^\/reception\/rejected$/, 'reception', pages.rejected],
    [/^\/reception\/labels\/(\d+)$/, 'reception', pages.labels],
    [/^\/reception\/search$/, 'reception', pages.search],
    [/^\/nurse\/?$/, 'nurse', pages.nurse],
    [/^\/nurse\/consultation\/(\d+)$/, 'nurse', pages.nurseConsultation],
    [/^\/doctor\/?$/, 'doctor', pages.doctor],
    [/^\/doctor\/consultation\/(\d+)$/, 'doctor', pages.doctorConsultation],
    [/^\/doctor\/summary\/(\d+)$/, 'doctor', pages.summary],
    [/^\/billing\/?$/, 'admin', pages.billing],
    [/^\/billing\/(\d+)$/, 'admin', pages.bill]
  ];
  function parse() {
    var h = location.hash.replace(/^#/, '') || '/';
    var i = h.indexOf('?'), path = i >= 0 ? h.slice(0, i) : h, q = {};
    if (i >= 0) h.slice(i + 1).split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); });
    return { path: path, q: q };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  var app = document.getElementById('app');
  function render() {
    var r = parse(), u = currentUser(), page;
    if (r.path === '/login' || !u) {
      if (u) return go(ROLE_HOME[u.role]);
      if (r.path !== '/login') return go('#/login');
      page = pages.login();
    } else if (r.path === '/' || r.path === '') {
      return go(ROLE_HOME[u.role]);
    } else {
      page = notFound();
      for (var i = 0; i < ROUTES.length; i++) {
        var m = r.path.match(ROUTES[i][0]);
        if (m) { page = u.role === ROUTES[i][1] ? ROUTES[i][2](r.q, m[1]) : forbidden(); break; }
      }
    }
    if (page.redirect) return go(page.redirect);
    app.innerHTML = page.raw || shell(page);
    flashes = [];
    document.title = (page.raw ? 'Connexion' : (document.querySelector('.crumbs strong') || {}).textContent || 'SysCHS') + ' · SysCHS';
    afterRender();
  }
  function afterRender() {
    window.scrollTo(0, 0);
    var af = app.querySelector('[autofocus]'); if (af) af.focus({ preventScroll: true });
    var clock = document.getElementById('clock');
    if (clock) {
      var fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      clock.textContent = fmt.format(new Date());
    }
    syncDecision();
  }
  function syncDecision() {
    var checked = app.querySelector('input[name=decision]:checked'); if (!checked) return;
    var surg = checked.value === 'chirurgie';
    app.querySelector('#surg').hidden = !surg; app.querySelector('#med').hidden = surg;
    app.querySelectorAll('input[name=decision]').forEach(function (r) { r.closest('.choice').classList.toggle('checked', r.checked); });
  }
  setInterval(function () { var c = document.getElementById('clock'); if (c) afterClock(c); }, 15000);
  function afterClock(c) { c.textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date()); }

  // ------------------------------------------------------------------ Actions (formulaires)
  function login(username, password) {
    var u = db.users.filter(function (x) { return x.username === String(username).trim(); })[0];
    if (u && password === CONFIG.password) { db.session = u.id; save(); go(ROLE_HOME[u.role]); }
    else { flash('Identifiant ou mot de passe incorrect.', 'error'); render(); }
  }
  var FORMS = {
    login: function (f) { login(f.username, f.password); },
    cnss: function (f) {
      var card = String(f.cnss_number || '').trim(), res = cnssValidate(card);
      if (res.status !== 'valid') { lastRejected = { card: card, result: res }; return go('#/reception/rejected'); }
      go('#/reception/register?card=' + encodeURIComponent(card));
    },
    register: function (f, form) {
      var card = form.dataset.card;
      if (cnssValidate(card).status !== 'valid') return go('#/reception');
      var data = { first_name: f.first_name.trim(), last_name: f.last_name.trim(), address: f.address.trim(), phone: f.phone.trim() };
      if (!data.first_name || !data.last_name) return showError('Le nom et le prénom sont obligatoires.');
      var c = registerVisit(currentUser(), card, data);
      go('#/reception/labels/' + c.id);
    },
    search: function (f) { go('#/reception/search?q=' + encodeURIComponent(String(f.q || '').trim())); },
    scan: function (f) {
      var c = findOpenByBarcode(f.barcode, ST.REGISTERED);
      if (!c) return showError('Aucun dossier en attente pour ce code-barres.');
      go('#/nurse/consultation/' + c.id);
    },
    nurse: function (f, form) {
      var c = byId(db.consultations, form.dataset.id);
      try { saveNurseEntry(c, currentUser(), f.prescription_details, f.nurse_notes); }
      catch (e) { return showError(e.message); }
      flash('Ordonnance enregistrée. Informez le patient que le médecin va le recevoir.', 'ok');
      go('#/nurse');
    },
    doctor: function (f, form) {
      var c = byId(db.consultations, form.dataset.id);
      try { closeConsultation(c, currentUser(), f); }
      catch (e) { return showError(e.message); }
      go('#/doctor/summary/' + c.id);
    },
    sysbill: function () {
      var b = runSysbill();
      if (!b) { flash('Aucun acte à facturer.', 'error'); return render(); }
      flash('Facture n°' + b.id + ' générée (' + b.total_acts + ' actes).', 'ok');
      go('#/billing/' + b.id);
    }
  };
  app.addEventListener('submit', function (e) {
    var form = e.target, name = form.dataset.form;
    if (!FORMS[name]) return;
    e.preventDefault();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    FORMS[name](data, form);
  });
  app.addEventListener('click', function (e) {
    var t = e.target.closest('button, a'); if (!t) return;
    if (t.dataset.login) { login(t.dataset.login, CONFIG.password); return; }
    if (t.dataset.fill) { var i = app.querySelector('#cnss_number'); i.value = t.dataset.fill; i.focus(); return; }
    if (t.dataset.fillScan) { var s = app.querySelector('#barcode'); s.value = t.dataset.fillScan; s.focus(); return; }
    if (t.dataset.search) { go('#/reception/search?q=' + encodeURIComponent(t.dataset.search)); return; }
    switch (t.dataset.action) {
      case 'logout': db.session = null; save(); go('#/login'); break;
      case 'menu': document.getElementById('sidebar').classList.toggle('open'); break;
      case 'print': window.print(); break;
      case 'retry': sendBill(byId(db.bills, t.dataset.id)); render(); break;
      case 'reset':
        if (confirm('Réinitialiser la démo ? Toutes les données saisies seront remplacées par le jeu de démonstration.')) {
          var keep = db.session; seedDemo(); db.session = keep; save(); flash('Démo réinitialisée.', 'ok'); go(ROLE_HOME[currentUser().role]);
        }
        break;
    }
  });
  app.addEventListener('change', function (e) { if (e.target.name === 'decision') syncDecision(); });
  window.addEventListener('hashchange', render);

  // ------------------------------------------------------------------ Démarrage
  db = load();
  if (!db || !db.users) seedDemo();
  render();
})();
