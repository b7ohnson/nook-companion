import { useTasks } from '../hooks/useTasks'
import { useGroceries } from '../hooks/useGroceries'

export default function HomeTab({ user }) {
  const { tasks }    = useTasks()
  const { items }    = useGroceries()

  const blessingPending = (tasks.blessing || []).filter(t => !t.done).length
  const pearlPending    = (tasks.pearl    || []).filter(t => !t.done).length
  const groceryPending  = items.filter(i => !i.done).length
  const groceryDone     = items.filter(i => i.done).length

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="tab-content">
      <div className="home-hero">
        <p className="home-greeting">{greeting},</p>
        <h2 className="home-name">{user?.displayName?.split(' ')[0] || 'there'}</h2>
      </div>

      <div className="home-cards">
        <div className="home-card">
          <div className="home-card-icon" style={{ background: '#EEF2FF' }}>📋</div>
          <div className="home-card-body">
            <div className="home-card-label">Blessing's Tasks</div>
            <div className="home-card-value">{blessingPending} pending</div>
          </div>
        </div>

        <div className="home-card">
          <div className="home-card-icon" style={{ background: '#FAF5FF' }}>📋</div>
          <div className="home-card-body">
            <div className="home-card-label">Pearl's Tasks</div>
            <div className="home-card-value">{pearlPending} pending</div>
          </div>
        </div>

        <div className="home-card">
          <div className="home-card-icon" style={{ background: '#F0FDF4' }}>🛒</div>
          <div className="home-card-body">
            <div className="home-card-label">Groceries</div>
            <div className="home-card-value">
              {groceryPending} to get{groceryDone > 0 ? `, ${groceryDone} done` : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="home-tip">
        Changes sync instantly to the NooK display.
      </div>
    </div>
  )
}
