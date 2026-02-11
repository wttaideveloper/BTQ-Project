type Protection = {
  id: string;
  shouldProtect: () => boolean;
  confirmLeave: () => Promise<boolean>;
};

const protections: Record<string, Protection> = {};

export function registerNavigationProtection(
  id: string,
  shouldProtect: () => boolean,
  confirmLeave: () => Promise<boolean>
) {
  protections[id] = { id, shouldProtect, confirmLeave };
}

export function unregisterNavigationProtection(id: string) {
  delete protections[id];
}

export function findActiveProtection(): Protection | null {
  for (const key of Object.keys(protections)) {
    const p = protections[key];
    try {
      if (p.shouldProtect()) return p;
    } catch (_) {
      // ignore error from user-provided predicate
    }
  }
  return null;
}

export function clearAllProtections() {
  for (const k of Object.keys(protections)) delete protections[k];
}

export default {
  registerNavigationProtection,
  unregisterNavigationProtection,
  findActiveProtection,
  clearAllProtections,
};


