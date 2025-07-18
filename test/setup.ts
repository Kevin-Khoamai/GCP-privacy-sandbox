// Test setup for Vitest
// Mock browser APIs for testing
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn()
    }
  },
  tabs: {
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  webNavigation: {
    onCompleted: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
} as any;