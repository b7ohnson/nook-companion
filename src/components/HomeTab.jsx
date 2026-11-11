import { useTasks } from '../hooks/useTasks'
import { useGroceries } from '../hooks/useGroceries'
import { IconChevronRight } from './Icons'

const PEOPLE = [
  { id: 'blessing', label: 'Blessing', color: 'var(--p-blessing)' },
  { id: 'pearl',    label: 'Pearl',    color: 'var(--p-pearl)'    },
]

const RECUR_SHORT = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' }

const CHORES_EACH = 3
const GROCERIES_SHOWN = 6

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}` }

// Opens on what someone actually wants to know: whose chores are still
// open and what is left to buy. The section headings are the buttons.
export default function HomeTab({ onNavigate }) {
  const { tasks, synced: tasksSynced } = useTasks()
  const { items, synced: grocSynced }  = useGroceries()

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const people = PEOPLE.map(p => ({ ...p, open: (tasks[p.id] || []).filter(t => !t.done) }))
  const choresLeft = people.reduce((n, p) => n + p.open.length, 0)
  const toBuy = items.filter(i => !i.done)

  return (
    <div className="tab-content">
      <h2 className="home-date">{today}</h2>

      <section className="home-section" aria-labelledby="home-chores">
        <h3 className="home-section-head" id="home-chores">
          <button className="home-section-link" onClick={() => onNavigate('tasks')}>
            <span className="home-section-title">Chores</span>
            <span className="home-section-count">
              {tasksSynced && (choresLeft ? `${choresLeft} left` : 'all done')}
            </span>
            <span className="home-section-go"><IconChevronRight size={18} /></span>
          </button>
        </h3>

        {!tasksSynced ? (
          <p className="home-quiet">Loading…</p>
        ) : choresLeft === 0 ? (
          <p className="home-quiet">Every chore is done.</p>
        ) : (
          people.filter(p => p.open.length).map(p => (
            <div key={p.id} style={{ '--person': p.color }}>
              <p className="home-person">
                {p.label}
                <span className="home-person-left">{plural(p.open.length, 'chore', 'chores')}</span>
              </p>
              <ul className="home-list">
                {p.open.slice(0, CHORES_EACH).map(t => (
                  <li key={t.id} className="home-list-item">
                    {t.task}
                    {RECUR_SHORT[t.recurrence] && <span className="home-list-meta">{RECUR_SHORT[t.recurrence]}</span>}
                  </li>
                ))}
              </ul>
              {p.open.length > CHORES_EACH && (
                <p className="home-more">and {p.open.length - CHORES_EACH} more</p>
              )}
            </div>
          ))
        )}
      </section>

      <section className="home-section" aria-labelledby="home-groceries">
        <h3 className="home-section-head" id="home-groceries">
          <button className="home-section-link" onClick={() => onNavigate('groceries')}>
            <span className="home-section-title">To buy</span>
            <span className="home-section-count">
              {grocSynced && (toBuy.length ? plural(toBuy.length, 'item', 'items') : '')}
            </span>
            <span className="home-section-go"><IconChevronRight size={18} /></span>
          </button>
        </h3>

        {!grocSynced ? (
          <p className="home-quiet">Loading…</p>
        ) : toBuy.length === 0 ? (
          <p className="home-quiet">The list is empty.</p>
        ) : (
          <>
            <ul className="home-list home-list--groceries">
              {toBuy.slice(0, GROCERIES_SHOWN).map(i => (
                <li key={i.id} className="home-list-item">{i.name}</li>
              ))}
            </ul>
            {toBuy.length > GROCERIES_SHOWN && (
              <p className="home-more">and {toBuy.length - GROCERIES_SHOWN} more</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
