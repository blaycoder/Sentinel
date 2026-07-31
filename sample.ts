import axios from 'axios'

const API_BASE = 'https://api.example.com'

export async function fetchUser(userId: string) {
  const res = await fetch(`${API_BASE}/health`)
  return axios.get(`${API_BASE}/users/${userId}`)
}

// Stubs for traversal-order demo (see demoCallOrder below)
function foo(_a: unknown, _b: unknown): void {}
function bar(_n: number): void {}
function baz(): void {}

/** Traversal-order demo: pre-order prints foo → bar → baz */
export function demoCallOrder() {
  foo(bar(1), baz())
}
