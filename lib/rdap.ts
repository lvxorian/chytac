export interface RDAPResult {
  isFree: boolean;
  isPendingDelete: boolean;
  isRedemptionPeriod: boolean;
  isTransitional: boolean;
  statusCode: number;
  rdapStatuses: string[];
  error?: string;
}

const RDAP_BASE_URL = 'https://rdap.nic.cz/domain';
const WHOIS_URL = 'https://www.nic.cz/whois/domain';

async function checkWhoisExists(domain: string): Promise<boolean> {
  try {
    const response = await fetch(`${WHOIS_URL}/${domain}/`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Chytac/1.0 (domain monitoring)',
      },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function checkDomain(domain: string): Promise<RDAPResult> {
  const url = `${RDAP_BASE_URL}/${domain}`;
  let retries = 3;

  while (retries > 0) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/rdap+json',
          'User-Agent': 'Chytac/1.0 (domain monitoring)',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 404) {
        const whoisExists = await checkWhoisExists(domain);

        if (!whoisExists) {
          return {
            isFree: true,
            isPendingDelete: false,
            isRedemptionPeriod: false,
            isTransitional: false,
            statusCode: 404,
            rdapStatuses: [],
          };
        }

        return {
          isFree: false,
          isPendingDelete: false,
          isRedemptionPeriod: false,
          isTransitional: true,
          statusCode: 404,
          rdapStatuses: [],
        };
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitSeconds = retryAfter
          ? parseInt(retryAfter, 10)
          : Math.pow(2, 4 - retries) * 10;
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        retries--;
        continue;
      }

      if (!response.ok) {
        return {
          isFree: false,
          isPendingDelete: false,
          isRedemptionPeriod: false,
          isTransitional: false,
          statusCode: response.status,
          rdapStatuses: [],
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      const statuses: string[] = Array.isArray(data.status) ? data.status : [];

      const isPendingDelete =
        statuses.includes('pending delete') || statuses.includes('pendingDelete');
      const isRedemptionPeriod =
        statuses.includes('redemption period') || statuses.includes('redemptionPeriod');

      return {
        isFree: false,
        isPendingDelete,
        isRedemptionPeriod,
        isTransitional: false,
        statusCode: 200,
        rdapStatuses: statuses,
      };
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        retries--;
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      return {
        isFree: false,
        isPendingDelete: false,
        isRedemptionPeriod: false,
        isTransitional: false,
        statusCode: 0,
        rdapStatuses: [],
        error: err.message || 'Unknown error',
      };
    }
  }

  return {
    isFree: false,
    isPendingDelete: false,
    isRedemptionPeriod: false,
    isTransitional: false,
    statusCode: 0,
    rdapStatuses: [],
    error: 'Max retries exceeded',
  };
}
