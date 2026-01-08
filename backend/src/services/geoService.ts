/**
 * GEO SERVICE
 * Fetches user location data from IP-API for "city-scan" warm-up
 */

import axios from 'axios';

export interface GeoData {
    city: string;
    country: string;
    countryCode: string;
    timezone: string;
    lat: number;
    lon: number;
    query: string; // IP address
}

class GeoService {
    private readonly API_URL = 'http://ip-api.com/json';
    private cache: Map<string, GeoData> = new Map();

    /**
     * Check if IP is a local/private IP
     */
    private isLocalIP(ip?: string): boolean {
        if (!ip) return true;
        return ip === '127.0.0.1'
            || ip === '::1'
            || ip === 'localhost'
            || ip.startsWith('192.168.')
            || ip.startsWith('10.')
            || ip.startsWith('172.');
    }

    /**
     * Get geo data for a given IP address
     * If no IP provided or localhost, fetches based on public IP
     */
    async getGeoData(ip?: string): Promise<GeoData> {
        // For localhost, don't pass IP - let IP-API detect public IP
        const isLocal = this.isLocalIP(ip);
        const cacheKey = isLocal ? 'public' : (ip || 'self');

        if (this.cache.has(cacheKey)) {
            console.log(`[GeoService] Cache hit for: ${cacheKey}`);
            return this.cache.get(cacheKey)!;
        }

        try {
            // For local IPs, call without IP param to get based on public IP
            const url = isLocal ? this.API_URL : `${this.API_URL}/${ip}`;
            console.log(`[GeoService] Fetching geo data from: ${url} (local: ${isLocal})`);

            const response = await axios.get(url, { timeout: 5000 });

            if (response.data.status === 'fail') {
                throw new Error(`IP-API error: ${response.data.message}`);
            }

            const geoData: GeoData = {
                city: response.data.city || 'Unknown',
                country: response.data.country || 'Unknown',
                countryCode: response.data.countryCode || 'XX',
                timezone: response.data.timezone || 'UTC',
                lat: response.data.lat || 0,
                lon: response.data.lon || 0,
                query: response.data.query || ip || 'unknown'
            };

            this.cache.set(cacheKey, geoData);
            console.log(`[GeoService] Located: ${geoData.city}, ${geoData.country}`);

            return geoData;
        } catch (error) {
            console.error('[GeoService] Failed to fetch geo data:', error);
            // Return fallback data
            return {
                city: 'Unknown',
                country: 'Unknown',
                countryCode: 'XX',
                timezone: 'UTC',
                lat: 0,
                lon: 0,
                query: ip || 'unknown'
            };
        }
    }

    /**
     * Get time of day based on timezone
     */
    getTimeOfDay(timezone: string): 'day' | 'night' | 'dawn' | 'dusk' {
        try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: 'numeric',
                hour12: false
            });
            const hour = parseInt(formatter.format(now));

            if (hour >= 6 && hour < 8) return 'dawn';
            if (hour >= 8 && hour < 18) return 'day';
            if (hour >= 18 && hour < 20) return 'dusk';
            return 'night';
        } catch {
            return 'day';
        }
    }
}

export const geoService = new GeoService();
