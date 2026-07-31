import axios from 'axios'

const API_BASE = 'https://api.example.com'

export async function fetchUser(userId: string) {
  const res = await fetch(`${API_BASE}/health`)
  return axios.get(`${API_BASE}/users/${userId}`)
}

export function UserBadge({ name }: { name: string }) {
  return <span className="badge">{name}</span>
}
