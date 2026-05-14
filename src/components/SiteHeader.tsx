import { Link, NavLink } from 'react-router-dom'

import { BrandMark } from './BrandMark'

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-links__link${isActive ? ' nav-links__link--active' : ''}`
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner page-wrap">
        <Link to="/" className="brand">
          <BrandMark />
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/" className={navClass} end>
            Schedule
          </NavLink>
          <NavLink to="/rinks" className={navClass}>
            Rinks
          </NavLink>
          <NavLink to="/youth-organizations" className={navClass}>
            Youth Hockey
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
