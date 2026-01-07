require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.static('public'));

// 네이버 API 설정
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 브라우저 인스턴스 (재사용)
let browser = null;

// 브라우저 초기화
async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('✅ Puppeteer 브라우저 시작');
    }
    return browser;
}

// 네이버 플레이스에서 리뷰/메뉴 스크래핑
async function scrapeStoreDetails(placeUrl) {
    try {
        const browser = await initBrowser();
        const page = await browser. newPage();
        
        // User-Agent 설정 (봇 차단 방지)
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        console.log(`   🔗 스크래핑:   ${placeUrl}`);
        
        await page.goto(placeUrl, {
            waitUntil:  'networkidle2',
            timeout: 10000
        });
        
        // 페이지 내용 추출
        const details = await page.evaluate(() => {
            const result = {
                reviews: [],
                menu: []
            };
            
            // 리뷰 추출 (최대 10개)
            const reviewElements = document.querySelectorAll('.review_text, . rvw_cont, [class*="review"]');
            reviewElements.forEach((el, index) => {
                if (index < 10) {
                    const text = el.textContent.trim();
                    if (text. length > 10) {
                        result.reviews.push(text);
                    }
                }
            });
            
            // 메뉴 추출
            const menuElements = document.querySelectorAll('.menu_item, .place_menu, [class*="menu"]');
            menuElements.forEach(el => {
                const text = el.textContent.trim();
                if (text.length > 2 && text.length < 50) {
                    result.menu.push(text);
                }
            });
            
            return result;
        });
        
        await page.close();
        
        console.log(`   ✅ 리뷰 ${details.reviews.length}개, 메뉴 ${details.menu.length}개 발견`);
        
        return details;
        
    } catch (error) {
        console.error(`   ❌ 스크래핑 실패:  ${error.message}`);
        return { reviews: [], menu: [] };
    }
}

// 리뷰/메뉴에서 키워드 검색
function hasKeywordInDetails(details, keywords) {
    const searchText = [
        ...details.reviews,
        ...details.menu
    ].join(' ').toLowerCase();
    
    return keywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
    );
}

// 1단계: 키워드로 직접 검색
async function searchByKeyword(keyword) {
    try {
        const response = await axios.get('https://openapi.naver.com/v1/search/local. json', {
            params: {
                query: keyword,
                display: 50,
                start: 1,
                sort: 'random'
            },
            headers: {
                'X-Naver-Client-Id': NAVER_CLIENT_ID,
                'X-Naver-Client-Secret':  NAVER_CLIENT_SECRET
            }
        });
        
        return response.data.items || [];
    } catch (error) {
        console.error('키워드 검색 오류:', error. message);
        return [];
    }
}

// 2단계: 위치 기반 주변 카페/디저트 검색
async function searchNearbyStores(lat, lng, radius = 5) {
    const categories = [
        '카페',
        '디저트',
        '베이커리',
        '쿠키',
        '디저트카페'
    ];
    
    let allStores = [];
    
    for (const category of categories) {
        try {
            const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
                params: {
                    query:  category,
                    display: 50,
                    start: 1,
                    sort: 'random'
                },
                headers: {
                    'X-Naver-Client-Id': NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret':  NAVER_CLIENT_SECRET
                }
            });
            
            if (response.data.items) {
                allStores = allStores.concat(response.data. items);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error(`${category} 검색 오류: `, error.message);
        }
    }
    
    const uniqueStores = Array.from(
        new Map(allStores.map(store => [store.title, store])).values()
    );
    
    console.log(`✅ 주변 매장 ${uniqueStores.length}개 발견`);
    
    return uniqueStores;
}

// 3단계:  '두바이쫀득쿠키' 관련 매장 필터링 (매장명/카테고리)
function filterByBasicInfo(stores, keyword = '두바이쫀득쿠키') {
    const searchTerms = [
        '두바이쫀득쿠키',
        '두바이 쫀득쿠키',
        '두바이쫀득',
        '두쫀쿠',
        '두바이 쿠키',
        'dubai cookie'
    ];
    
    const filtered = stores.filter(store => {
        const title = removeHtmlTags(store.title).toLowerCase();
        const category = store.category.toLowerCase();
        const address = store.address.toLowerCase();
        
        return searchTerms.some(term => 
            title. includes(term. toLowerCase()) ||
            category.includes(term.toLowerCase()) ||
            address.includes(term.toLowerCase())
        );
    });
    
    console.log(`✅ 기본 정보 필터링 결과: ${filtered.length}개 매장`);
    
    return filtered;
}

// 4단계: 리뷰/메뉴에서 추가 필터링 (선택사항)
async function filterByReviewsAndMenu(stores, useDetailedSearch = false) {
    if (! useDetailedSearch || stores.length === 0) {
        return stores;
    }
    
    console.log('4️⃣ 리뷰/메뉴 상세 검색 시작.. .');
    
    const searchKeywords = [
        '두바이쫀득쿠키',
        '두바이 쿠키',
        '두쫀쿠',
        'dubai cookie'
    ];
    
    const detailedResults = [];
    
    // 최대 20개만 스크래핑 (시간 제한)
    const storesToCheck = stores.slice(0, 20);
    
    for (const store of storesToCheck) {
        if (! store.link) continue;
        
        console.log(`   📄 ${removeHtmlTags(store.title)} 확인 중...`);
        
        const details = await scrapeStoreDetails(store.link);
        
        // 리뷰나 메뉴에 키워드가 있는지 확인
        if (hasKeywordInDetails(details, searchKeywords)) {
            console.log(`   ✅ 키워드 발견! `);
            detailedResults.push({
                ...store,
                hasDetailedMatch: true,
                reviewCount: details.reviews.length,
                menuCount: details.menu. length
            });
        }
        
        // API 부하 방지
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ 리뷰/메뉴 검색 결과: ${detailedResults. length}개 매장`);
    
    return detailedResults. length > 0 ? detailedResults : stores;
}

// HTML 태그 제거
function removeHtmlTags(str) {
    return str.replace(/<\/?b>/g, '');
}

// 데이터 정규화
function normalizeStore(item) {
    return {
        name: removeHtmlTags(item.title),
        address: item.address,
        roadAddress: item.roadAddress,
        mapx: item.mapx,
        mapy: item.mapy,
        phone: item.telephone || '전화번호 없음',
        category: item.category,
        link: item.link,
        hasDetailedMatch: item.hasDetailedMatch || false
    };
}

// 통합 검색 API
app.get('/api/search-stores', async (req, res) => {
    try {
        const keyword = req. query.keyword || '두바이쫀득쿠키';
        const lat = parseFloat(req.query. lat);
        const lng = parseFloat(req.query.lng);
        const useLocation = ! isNaN(lat) && !isNaN(lng);
        const detailedSearch = req.query. detailed === 'true'; // 리뷰/메뉴 검색 활성화
        
        console.log('\n========================================');
        console.log(`🔍 검색 시작`);
        console.log(`📝 키워드: ${keyword}`);
        console.log(`📍 위치 기반: ${useLocation ?  'YES' : 'NO'}`);
        console.log(`🔎 상세 검색 (리뷰/메뉴): ${detailedSearch ? 'YES' : 'NO'}`);
        if (useLocation) {
            console.log(`   좌표: ${lat}, ${lng}`);
        }
        console.log('========================================\n');
        
        let stores = [];
        
        if (useLocation) {
            console.log('🎯 전략: 위치 기반 + 필터링');
            
            // 1단계: 키워드 직접 검색
            console.log('1️⃣ 키워드 직접 검색...');
            const keywordResults = await searchByKeyword(keyword);
            console.log(`   → ${keywordResults.length}개 발견`);
            
            // 2단계: 주변 카페/디저트 검색
            console.log('2️⃣ 주변 카페/디저트 검색...');
            const nearbyStores = await searchNearbyStores(lat, lng);
            console.log(`   → ${nearbyStores.length}개 발견`);
            
            // 3단계: 기본 정보 필터링
            console.log('3️⃣ 기본 정보 필터링...');
            const filteredStores = filterByBasicInfo(nearbyStores, keyword);
            console.log(`   → ${filteredStores.length}개 발견`);
            
            // 결과 합치기
            const combined = [...keywordResults, ...filteredStores];
            const uniqueMap = new Map();
            combined.forEach(store => {
                const key = removeHtmlTags(store.title) + store.address;
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, store);
                }
            });
            
            stores = Array.from(uniqueMap.values());
            
            // 4단계: 리뷰/메뉴 상세 검색 (옵션)
            if (detailedSearch) {
                stores = await filterByReviewsAndMenu(stores, true);
            }
            
            console.log(`✅ 최종 결과: ${stores.length}개 매장`);
            
        } else {
            console. log('🎯 전략: 키워드 검색만');
            stores = await searchByKeyword(keyword);
            console.log(`✅ 결과: ${stores.length}개 매장`);
        }
        
        const normalizedStores = stores.map(normalizeStore);
        
        console.log('========================================\n');
        
        res.json({
            success: true,
            count: normalizedStores.length,
            stores: normalizedStores,
            method: useLocation ? 'location-based' : 'keyword-only',
            detailedSearch: detailedSearch
        });
        
    } catch (error) {
        console.error('❌ 검색 오류:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error:  '매장 검색에 실패했습니다.',
            details: error.response?.data || error.message
        });
    }
});

// 서버 종료 시 브라우저 정리
process.on('SIGINT', async () => {
    if (browser) {
        await browser.close();
        console.log('✅ 브라우저 종료');
    }
    process.exit();
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ 서버가 실행되었습니다! `);
    console.log(`📍 브라우저에서 http://localhost:${PORT} 를 열어보세요!\n`);
});