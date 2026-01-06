require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// 네이버 API 설정
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 1단계: 키워드로 직접 검색
async function searchByKeyword(keyword) {
    try {
        const response = await axios.get('https://openapi.naver.com/v1/search/local.json', {
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
        
        return response.data. items || [];
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
                    query: category,
                    display:  50,
                    start:  1,
                    sort:  'random'
                },
                headers: {
                    'X-Naver-Client-Id': NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret':  NAVER_CLIENT_SECRET
                }
            });
            
            if (response.data.items) {
                allStores = allStores.concat(response.data. items);
            }
            
            // API 호출 제한 방지 (짧은 대기)
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error(`${category} 검색 오류:`, error.message);
        }
    }
    
    // 중복 제거 (같은 장소가 여러 카테고리에서 나올 수 있음)
    const uniqueStores = Array. from(
        new Map(allStores. map(store => [store.title, store])).values()
    );
    
    console.log(`✅ 주변 매장 ${uniqueStores.length}개 발견`);
    
    return uniqueStores;
}

// 3단계:  '두바이쫀득쿠키' 관련 매장 필터링
function filterDubaiCookieStores(stores, keyword = '두바이쫀득쿠키') {
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
        
        // 매장명, 카테고리, 주소에서 키워드 검색
        return searchTerms.some(term => 
            title.includes(term. toLowerCase()) ||
            category.includes(term.toLowerCase()) ||
            address.includes(term.toLowerCase())
        );
    });
    
    console.log(`✅ 필터링 결과:  ${filtered.length}개 매장`);
    
    return filtered;
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
        link: item.link
    };
}

// 통합 검색 API
app.get('/api/search-stores', async (req, res) => {
    try {
        const keyword = req.query.keyword || '두바이쫀득쿠키';
        const lat = parseFloat(req.query. lat);
        const lng = parseFloat(req.query.lng);
        const useLocation = ! isNaN(lat) && !isNaN(lng);
        
        console.log('\n========================================');
        console.log(`🔍 검색 시작`);
        console.log(`📝 키워드: ${keyword}`);
        console.log(`📍 위치 기반:  ${useLocation ? 'YES' : 'NO'}`);
        if (useLocation) {
            console.log(`   좌표: ${lat}, ${lng}`);
        }
        console.log('========================================\n');
        
        let stores = [];
        
        if (useLocation) {
            console.log('🎯 전략: 위치 기반 + 필터링');
            
            // 1단계: 키워드 직접 검색
            console.log('1️⃣ 키워드 직접 검색.. .');
            const keywordResults = await searchByKeyword(keyword);
            console.log(`   → ${keywordResults.length}개 발견`);
            
            // 2단계: 주변 카페/디저트 검색
            console.log('2️⃣ 주변 카페/디저트 검색...');
            const nearbyStores = await searchNearbyStores(lat, lng);
            console.log(`   → ${nearbyStores.length}개 발견`);
            
            // 3단계:  필터링
            console.log('3️⃣ 두바이쫀득쿠키 관련 매장 필터링...');
            const filteredStores = filterDubaiCookieStores(nearbyStores, keyword);
            console.log(`   → ${filteredStores.length}개 발견`);
            
            // 결과 합치기 (중복 제거)
            const combined = [...keywordResults, ...filteredStores];
            const uniqueMap = new Map();
            combined.forEach(store => {
                const key = removeHtmlTags(store.title) + store.address;
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, store);
                }
            });
            
            stores = Array.from(uniqueMap.values());
            console.log(`✅ 최종 결과: ${stores.length}개 매장`);
            
        } else {
            console. log('🎯 전략: 키워드 검색만');
            stores = await searchByKeyword(keyword);
            console.log(`✅ 결과: ${stores.length}개 매장`);
        }
        
        // 데이터 정규화
        const normalizedStores = stores. map(normalizeStore);
        
        console.log('========================================\n');
        
        res.json({
            success: true,
            count: normalizedStores.length,
            stores: normalizedStores,
            method: useLocation ? 'location-based' : 'keyword-only'
        });
        
    } catch (error) {
        console.error('❌ 검색 오류:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: '매장 검색에 실패했습니다.',
            details: error.response?.data || error.message
        });
    }
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ 서버가 실행되었습니다! `);
    console.log(`📍 브라우저에서 http://localhost:${PORT} 를 열어보세요!\n`);
});