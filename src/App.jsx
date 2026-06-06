import { useState, useEffect, useCallback } from 'react'

const SITE_TOKEN = import.meta.env.VITE_SITE_TOKEN || ''

// ── API helpers ───────────────────────────────────────────────────────────────

const api = {
  list: () =>
    fetch('/.netlify/functions/notion?action=list', { headers: { 'x-site-token': SITE_TOKEN } }).then((r) => r.json()),
  create: (data) =>
    fetch('/.netlify/functions/notion?action=create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-site-token': SITE_TOKEN },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  update: (data) =>
    fetch('/.netlify/functions/notion?action=update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-site-token': SITE_TOKEN },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  delete: (id) =>
    fetch('/.netlify/functions/notion?action=delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-site-token': SITE_TOKEN },
      body: JSON.stringify({ id }),
    }).then((r) => r.json()),
  extract: (data) =>
    fetch('/.netlify/functions/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-site-token': SITE_TOKEN },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  og: (url) =>
    fetch('/.netlify/functions/og', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-site-token': SITE_TOKEN },
      body: JSON.stringify({ url }),
    }).then((r) => r.json()),
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null
  const d = new Date(str + 'T12:00:00')
  return isNaN(d) ? null : d
}

function isPast(ev) {
  const d = parseDate(ev.date)
  if (!d) return false
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return d < t
}

function daysUntil(ev) {
  const d = parseDate(ev.date)
  if (!d) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((d - t) / 86400000)
}

function formatDate(str) {
  if (!str) return null
  const d = parseDate(str)
  if (!d) return str
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatSaved(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`
}

function nudgeText(ev) {
  const days = daysUntil(ev)
  if (days === null || days < 0) return null
  if (days === 0) return 'Today!'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return `${days} days away`
  if (days <= 14) return '2 weeks away'
  if (days <= 30) return 'This month'
  return null
}

const TYPE_COLORS = {
  Music: '#7C3AED',
  Film: '#92400E',
  Art: '#BE185D',
  Food: '#C2410C',
  Market: '#A16207',
  Sport: '#1D4ED8',
  Other: '#374151',
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOWS = ['M','T','W','T','F','S','S']
const FILTERS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'soon', label: 'This month' },
  { key: 'going', label: 'Going' },
  { key: 'nodate', label: 'No date' },
  { key: 'past', label: 'Past' },
]

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ ev, onUpdate, onDelete, onEdit }) {
  const past = isPast(ev)
  const nudge = nudgeText(ev)
  const going = ev.status === 'Going'
  const days = daysUntil(ev)

  return (
    <div style={{
      background: 'var(--warm-white)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow)',
      opacity: past ? 0.45 : 1,
      transition: 'opacity 0.2s, transform 0.2s, box-shadow 0.2s',
      borderLeft: going ? '3px solid var(--teal)' : 'none',
      animation: 'fadeUp 0.3s ease forwards',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)' }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = 'var(--shadow)' }}
    >
      {/* Image */}
      {ev.imageUrl && (
        <div style={{ height: 160, overflow: 'hidden', position: 'relative' }}>
          <img
            src={ev.imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.parentElement.style.display = 'none' }}
          />
          {ev.type && (
            <span style={{
              position: 'absolute', top: 10, right: 10,
              background: TYPE_COLORS[ev.type] || '#374151',
              color: '#fff',
              fontSize: 11, fontWeight: 500,
              padding: '3px 9px', borderRadius: 20,
            }}>{ev.type}</span>
          )}
          {nudge && !past && (
            <span style={{
              position: 'absolute', bottom: 10, left: 10,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              color: '#fff',
              fontSize: 11, fontWeight: 500,
              padding: '3px 9px', borderRadius: 20,
            }}>⏰ {nudge}</span>
          )}
        </div>
      )}

      <div style={{ padding: '14px 16px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.3 }}>
            {ev.name}
          </div>
          <button onClick={() => onEdit(ev)} style={{
            background: 'none', border: 'none', color: 'var(--ink-30)',
            fontSize: 16, padding: '0 0 0 8px', flexShrink: 0, lineHeight: 1,
          }} title="Edit">✎</button>
        </div>

        {/* Date + location */}
        <div style={{ fontSize: 13, color: 'var(--ink-60)', marginBottom: 8, fontFamily: 'var(--sans)' }}>
          {formatDate(ev.date) || 'No date'}
          {ev.location && ` · ${ev.location}`}
        </div>

        {/* Tags row (no image) */}
        {!ev.imageUrl && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {ev.type && (
              <span style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 20,
                background: TYPE_COLORS[ev.type] + '18',
                color: TYPE_COLORS[ev.type],
                fontWeight: 500,
              }}>{ev.type}</span>
            )}
            {nudge && !past && (
              <span style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 20,
                background: 'var(--amber-light)', color: 'var(--amber)',
                fontWeight: 500,
              }}>⏰ {nudge}</span>
            )}
            {going && (
              <span style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 20,
                background: 'var(--teal-light)', color: 'var(--teal)',
                fontWeight: 500,
              }}>✓ Going</span>
            )}
          </div>
        )}

        {/* Description */}
        {ev.description && (
          <p style={{ fontSize: 13, color: 'var(--ink-60)', lineHeight: 1.5, marginBottom: 10 }}>
            {ev.description}
          </p>
        )}

        {/* People */}
        {ev.people && (
          <p style={{ fontSize: 12, color: 'var(--ink-60)', marginBottom: 10, fontStyle: 'italic' }}>
            👥 {ev.people}
          </p>
        )}

        {/* Links */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          {ev.venueUrl && (
            <a href={ev.venueUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 500 }}>
              More info ↗
            </a>
          )}
          {ev.sourceUrl && (
            <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--ink-60)' }}>
              Source ↗
            </a>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => onUpdate(ev.id, { status: going ? 'Maybe' : 'Going' })}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 500,
              borderRadius: 20, border: `1px solid ${going ? 'var(--teal)' : 'var(--ink-10)'}`,
              background: going ? 'var(--teal-light)' : 'transparent',
              color: going ? 'var(--teal-dark)' : 'var(--ink-60)',
              transition: 'all 0.15s',
            }}
          >{going ? '✓ Going' : 'Going'}</button>

          <button
            onClick={() => onUpdate(ev.id, { status: ev.status === 'Interested' ? 'Maybe' : 'Interested' })}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 500,
              borderRadius: 20,
              border: `1px solid ${ev.status === 'Interested' ? 'var(--ink-30)' : 'var(--ink-10)'}`,
              background: 'transparent', color: 'var(--ink-60)',
            }}
          >Maybe</button>

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 11, color: 'var(--ink-30)' }}>
            {formatSaved(ev.addedAt)}
          </span>

          <button
            onClick={() => onDelete(ev.id)}
            style={{
              background: 'none', border: 'none',
              fontSize: 16, color: 'var(--ink-30)',
              padding: '2px 4px',
              lineHeight: 1,
            }}
            title="Remove"
          >×</button>
        </div>
      </div>
    </div>
  )
}

// ── EditModal ─────────────────────────────────────────────────────────────────

function EditModal({ ev, onSave, onClose }) {
  const [form, setForm] = useState({
    name: ev.name || '',
    date: ev.date || '',
    location: ev.location || '',
    status: ev.status || 'Maybe',
    type: ev.type || '',
    people: ev.people || '',
    venueUrl: ev.venueUrl || '',
    sourceUrl: ev.sourceUrl || '',
    imageUrl: ev.imageUrl || '',
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.5)',
      backdropFilter: 'blur(4px)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 0 0 0',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--warm-white)', borderRadius: '20px 20px 0 0',
        padding: '20px 20px 40px', width: '100%', maxWidth: 560,
        maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400 }}>Edit event</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--ink-60)' }}>×</button>
        </div>

        {[
          { label: 'Name', key: 'name', type: 'text' },
          { label: 'Date', key: 'date', type: 'date' },
          { label: 'Location', key: 'location', type: 'text' },
          { label: 'People', key: 'people', type: 'text', placeholder: 'e.g. ask Alice, maybe Tom' },
          { label: 'Venue URL', key: 'venueUrl', type: 'url' },
          { label: 'Image URL', key: 'imageUrl', type: 'url' },
        ].map(({ label, key, type, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-60)', display: 'block', marginBottom: 4 }}>{label}</label>
            <input type={type} value={form[key]} onChange={set(key)} placeholder={placeholder}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--ink-10)', background: 'var(--cream)',
                fontSize: 14,
              }} />
          </div>
        ))}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-60)', display: 'block', marginBottom: 4 }}>Status</label>
          <select value={form.status} onChange={set('status')}
            style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ink-10)', background: 'var(--cream)', fontSize: 14, width: '100%' }}>
            {['Maybe', 'Interested', 'Going'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-60)', display: 'block', marginBottom: 4 }}>Type</label>
          <select value={form.type} onChange={set('type')}
            style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ink-10)', background: 'var(--cream)', fontSize: 14, width: '100%' }}>
            <option value="">—</option>
            {['Music', 'Film', 'Art', 'Food', 'Market', 'Sport', 'Other'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <button
          onClick={() => onSave(form)}
          style={{
            width: '100%', padding: '13px', background: 'var(--ink)',
            color: 'var(--cream)', border: 'none', borderRadius: 'var(--radius-sm)',
            fontSize: 15, fontWeight: 500,
          }}
        >Save changes</button>
      </div>
    </div>
  )
}

// ── CalendarWidget ────────────────────────────────────────────────────────────

function CalendarWidget({ events }) {
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())

  const changeMonth = (dir) => {
    setCalMonth(m => {
      const nm = m + dir
      if (nm > 11) { setCalYear(y => y + 1); return 0 }
      if (nm < 0) { setCalYear(y => y - 1); return 11 }
      return nm
    })
  }

  const firstDay = new Date(calYear, calMonth, 1)
  const lastDay = new Date(calYear, calMonth + 1, 0)
  let startDow = firstDay.getDay()
  startDow = startDow === 0 ? 6 : startDow - 1

  const eventDates = {}
  events.forEach(ev => {
    const d = parseDate(ev.date)
    if (!d) return
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      eventDates[d.getDate()] = ev.status === 'Going' ? 'going' : 'event'
    }
  })

  const days = []
  for (let i = 0; i < startDow; i++) days.push({ blank: true })
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({
      d,
      isToday: today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d,
      ev: eventDates[d],
    })
  }

  const now = new Date(); now.setHours(0, 0, 0, 0)
  const upcoming = events
    .filter(ev => { const d = parseDate(ev.date); return d && d >= now })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5)

  return (
    <div style={{ background: 'var(--warm-white)', borderRadius: 'var(--radius)', padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => changeMonth(-1)} style={{ background: 'none', border: 'none', color: 'var(--ink-60)', fontSize: 18, padding: '0 6px' }}>‹</button>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500 }}>{MONTHS[calMonth]} {calYear}</span>
        <button onClick={() => changeMonth(1)} style={{ background: 'none', border: 'none', color: 'var(--ink-60)', fontSize: 18, padding: '0 6px' }}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {DOWS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: 'var(--ink-30)', padding: '4px 0', fontWeight: 500 }}>{d}</div>
        ))}
        {days.map((day, i) => day.blank ? <div key={i} /> : (
          <div key={i} style={{
            textAlign: 'center', fontSize: 11, padding: '5px 2px',
            borderRadius: 6, fontWeight: day.isToday || day.ev ? 500 : 400,
            background: day.ev === 'going' ? 'var(--teal-light)' : day.ev ? '#E8F8F2' : day.isToday ? 'var(--cream)' : 'transparent',
            color: day.ev === 'going' ? 'var(--teal-dark)' : day.ev ? 'var(--teal)' : day.isToday ? 'var(--ink)' : 'var(--ink-60)',
          }}>{day.d}</div>
        ))}
      </div>

      {upcoming.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-30)', margin: '14px 0 8px' }}>Coming up</div>
          {upcoming.map(ev => {
            const d = daysUntil(ev)
            const label = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d}d`
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--ink-06)', alignItems: 'flex-start' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: ev.status === 'Going' ? 'var(--teal)' : '#9FE1CB', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{ev.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-30)' }}>{label}</div>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}


// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('upcoming')
  const [view, setView] = useState('inbox')
  const [editingEv, setEditingEv] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await api.list()
      if (Array.isArray(data)) setEvents(data)
      else throw new Error(data.error || 'Failed to load')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleUpdate = async (id, changes) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e))
    await api.update({ id, ...changes })
  }

  const handleDelete = async (id) => {
    setEvents(prev => prev.filter(e => e.id !== id))
    await api.delete(id)
  }

  const handleEditSave = async (form) => {
    setEvents(prev => prev.map(e => e.id === editingEv.id ? { ...e, ...form } : e))
    await api.update({ id: editingEv.id, ...form })
    setEditingEv(null)
  }

  const now = new Date(); now.setHours(0, 0, 0, 0)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const filtered = events.filter(ev => {
    if (filter === 'upcoming') return !isPast(ev)
    if (filter === 'soon') {
      const d = parseDate(ev.date)
      return d && d >= now && d <= monthEnd
    }
    if (filter === 'going') return ev.status === 'Going' && !isPast(ev)
    if (filter === 'nodate') return !ev.date
    if (filter === 'past') return isPast(ev)
    return true
  }).sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(a.date) - new Date(b.date)
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      {/* Header */}
      <div style={{
        background: 'var(--warm-white)', borderBottom: '1px solid var(--ink-06)',
        padding: '18px 20px 0', position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 400, fontStyle: 'italic', color: 'var(--ink)' }}>
              maybe shelf
            </h1>
            <span style={{ fontSize: 13, color: 'var(--ink-30)' }}>
              {events.filter(e => !isPast(e) && e.date).length} upcoming
            </span>
            <button onClick={load} title="Refresh" style={{
              background: 'none', border: 'none', color: 'var(--ink-30)',
              fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}>↻</button>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {['inbox', 'calendar'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '8px 16px', fontSize: 13, fontWeight: 500,
                background: 'none', border: 'none',
                borderBottom: view === v ? '2px solid var(--ink)' : '2px solid transparent',
                color: view === v ? 'var(--ink)' : 'var(--ink-60)',
                textTransform: 'capitalize', cursor: 'pointer',
              }}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 80px' }}>

        {view === 'calendar' ? (
          <CalendarWidget events={events} />
        ) : (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 16, paddingBottom: 2 }}>
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 500,
                  borderRadius: 20, flexShrink: 0, cursor: 'pointer',
                  border: `1px solid ${filter === f.key ? 'var(--ink)' : 'var(--ink-10)'}`,
                  background: filter === f.key ? 'var(--ink)' : 'transparent',
                  color: filter === f.key ? 'var(--cream)' : 'var(--ink-60)',
                  transition: 'all 0.15s',
                }}>{f.label}</button>
              ))}
            </div>

            {/* Cards */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink-30)' }}>
                <div style={{ width: 28, height: 28, border: '2px solid var(--ink-10)', borderTopColor: 'var(--ink)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                Loading your shelf…
              </div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--red)' }}>
                {error}
                <br /><button onClick={load} style={{ marginTop: 12, padding: '8px 16px', background: 'var(--ink)', color: 'var(--cream)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Retry</button>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink-30)', fontFamily: 'var(--serif)', fontSize: 16, fontStyle: 'italic' }}>
                {filter === 'past' ? 'No past events' : 'Nothing here yet'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                {filtered.map(ev => (
                  <EventCard
                    key={ev.id}
                    ev={ev}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onEdit={setEditingEv}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit modal */}
      {editingEv && (
        <EditModal ev={editingEv} onSave={handleEditSave} onClose={() => setEditingEv(null)} />
      )}
    </div>
  )
}
