// Content script for Instagram Follower Checker
// This script runs on Instagram pages and extracts follower/following data

console.log('🔍 IG Follower Checker content script loaded!');

let analysisState = {
  status: 'idle',
  progress: 0,
  message: '',
  followers: [],
  following: []
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received message:', request.action);
  
  if (request.action === 'ping') {
    console.log('🏓 Responding to ping');
    sendResponse({ status: 'ok' });
    return true;
  }
  
  if (request.action === 'startAnalysis') {
    console.log('🚀 Starting analysis...');
    // Reset state and start
    analysisState = {
      status: 'running',
      progress: 0,
      message: 'Starting analysis...',
      followers: [],
      following: []
    };
    
    // Start analysis in background
    runAnalysis();
    
    // Respond immediately that we've started
    sendResponse({ success: true, message: 'Analysis started' });
    return true;
  }
  
  if (request.action === 'getProgress') {
    console.log('📊 Progress check:', analysisState.status, analysisState.progress + '%', analysisState.message);
    sendResponse({
      status: analysisState.status,
      progress: analysisState.progress,
      message: analysisState.message,
      followers: analysisState.followers,
      following: analysisState.following
    });
    return true;
  }
});

async function runAnalysis() {
  try {
    // Get username from the current page or profile
    updateProgress(5, 'Detecting username...');
    const username = await getCurrentUsername();
    
    if (!username) {
      analysisState.status = 'error';
      analysisState.message = 'Could not detect username. Go to instagram.com/yourusername';
      console.error('❌ Could not detect username');
      return;
    }

    console.log('👤 Found username:', username);
    updateProgress(10, `Found @${username}, fetching followers...`);

    // Fetch followers
    try {
      analysisState.followers = await fetchUserList(username, 'followers');
      console.log('✅ Followers fetched:', analysisState.followers.length);
      
      // If followers is empty, try GraphQL fallback
      if (analysisState.followers.length === 0) {
        console.log('⚠️ REST API returned 0 followers, trying GraphQL...');
        updateProgress(30, 'Trying alternative method for followers...');
        analysisState.followers = await fetchUserListGraphQL(username, 'followers');
        console.log('✅ GraphQL Followers fetched:', analysisState.followers.length);
      }
    } catch (e) {
      console.error('❌ Error fetching followers:', e);
      // Try GraphQL fallback
      try {
        console.log('🔄 Trying GraphQL fallback for followers...');
        analysisState.followers = await fetchUserListGraphQL(username, 'followers');
      } catch (e2) {
        console.error('❌ GraphQL fallback also failed:', e2);
        analysisState.status = 'error';
        analysisState.message = `Error fetching followers: ${e.message}`;
        return;
      }
    }
    
    updateProgress(55, `Got ${analysisState.followers.length} followers, fetching following...`);
    
    // Fetch following
    try {
      analysisState.following = await fetchUserList(username, 'following');
      console.log('✅ Following fetched:', analysisState.following.length);
      
      // If following is empty, try GraphQL fallback
      if (analysisState.following.length === 0) {
        console.log('⚠️ REST API returned 0 following, trying GraphQL...');
        updateProgress(75, 'Trying alternative method for following...');
        analysisState.following = await fetchUserListGraphQL(username, 'following');
      }
    } catch (e) {
      console.error('❌ Error fetching following:', e);
      try {
        console.log('🔄 Trying GraphQL fallback for following...');
        analysisState.following = await fetchUserListGraphQL(username, 'following');
      } catch (e2) {
        console.error('❌ GraphQL fallback also failed:', e2);
        analysisState.status = 'error';
        analysisState.message = `Error fetching following: ${e.message}`;
        return;
      }
    }
    
    updateProgress(95, 'Converting profile pictures...');
    
    // Convert profile pics to base64 for the users we'll display (not following back + fans)
    // Calculate which users will be displayed
    const followersSet = new Set(analysisState.followers.map(f => f.username));
    const followingSet = new Set(analysisState.following.map(f => f.username));
    
    const notFollowingBack = analysisState.following.filter(f => !followersSet.has(f.username));
    const fans = analysisState.followers.filter(f => !followingSet.has(f.username));
    
    // Convert profile pics for display users
    console.log('🖼️ Converting profile pictures...');
    const displayUsers = [...notFollowingBack, ...fans];
    const convertedUsers = await convertProfilePics(displayUsers);
    
    // Update the original arrays with converted pics
    const convertedMap = new Map(convertedUsers.map(u => [u.username, u.profilePic]));
    analysisState.followers = analysisState.followers.map(u => ({
      ...u,
      profilePic: convertedMap.get(u.username) || u.profilePic
    }));
    analysisState.following = analysisState.following.map(u => ({
      ...u,
      profilePic: convertedMap.get(u.username) || u.profilePic
    }));
    
    updateProgress(100, 'Analysis complete!');
    analysisState.status = 'complete';
    console.log('🎉 Analysis complete!');
    console.log(`📊 Final: ${analysisState.followers.length} followers, ${analysisState.following.length} following`);
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
    analysisState.status = 'error';
    analysisState.message = error.message;
  }
}

// GraphQL fallback for fetching users
async function fetchUserListGraphQL(username, type) {
  const users = [];
  let hasNext = true;
  let endCursor = null;
  
  const userId = await getUserId(username);
  if (!userId) {
    throw new Error('Could not get user ID');
  }
  
  // GraphQL query hashes (these may change over time)
  const queryHash = type === 'followers' 
    ? 'c76146de99bb02f6415203be841dd25a'
    : 'd04b0a864b4b54837c0d870b0e77e076';
  
  const edgeKey = type === 'followers' ? 'edge_followed_by' : 'edge_follow';
  
  while (hasNext && users.length < 2000) { // Limit to prevent infinite loops
    try {
      const variables = {
        id: userId,
        include_reel: false,
        fetch_mutual: false,
        first: 50
      };
      
      if (endCursor) {
        variables.after = endCursor;
      }

      const url = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(JSON.stringify(variables))}`;
      
      console.log(`📡 GraphQL ${type}:`, url.substring(0, 100) + '...');
      
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': getCsrfToken(),
          'X-IG-App-ID': '936619743392459'
        }
      });

      if (!response.ok) {
        console.error(`❌ GraphQL error: ${response.status}`);
        break;
      }

      const data = await response.json();
      
      const edges = data?.data?.user?.[edgeKey]?.edges || [];
      const pageInfo = data?.data?.user?.[edgeKey]?.page_info || {};
      
      console.log(`📦 GraphQL ${type}: got ${edges.length} users, hasNext: ${pageInfo.has_next_page}`);
      
      for (const edge of edges) {
        users.push({
          username: edge.node.username,
          fullName: edge.node.full_name,
          profilePic: edge.node.profile_pic_url,
          isVerified: edge.node.is_verified,
          userId: edge.node.id
        });
      }

      hasNext = pageInfo.has_next_page;
      endCursor = pageInfo.end_cursor;
      
      // Update progress
      const baseProgress = type === 'followers' ? 10 : 55;
      updateProgress(
        baseProgress + Math.min(40, users.length / 50),
        `Fetching ${type} (alt): ${users.length} found...`
      );

      await sleep(1000);
      
    } catch (error) {
      console.error(`❌ GraphQL ${type} error:`, error);
      break;
    }
  }

  return users;
}

async function getCurrentUsername() {
  // Method 1: Try to get username from URL path
  const urlMatch = window.location.pathname.match(/^\/([^\/]+)\/?$/);
  if (urlMatch && !['explore', 'reels', 'direct', 'accounts', 'stories', 'p', 'tv'].includes(urlMatch[1])) {
    console.log('Found username from URL:', urlMatch[1]);
    return urlMatch[1];
  }
  
  // Method 2: Check if on /following or /followers page
  const followMatch = window.location.pathname.match(/^\/([^\/]+)\/(followers|following)\/?$/);
  if (followMatch) {
    console.log('Found username from follow page URL:', followMatch[1]);
    return followMatch[1];
  }
  
  // Method 3: Try to get from the page's header h2 element
  const headerSection = document.querySelector('header section');
  if (headerSection) {
    const h2 = headerSection.querySelector('h2');
    if (h2 && h2.textContent) {
      console.log('Found username from header:', h2.textContent);
      return h2.textContent.trim();
    }
  }
  
  // Method 4: Look for username in various page elements
  const usernameElements = document.querySelectorAll('header a[href^="/"]');
  for (const el of usernameElements) {
    const href = el.getAttribute('href');
    const match = href.match(/^\/([^\/]+)\/?$/);
    if (match && !['explore', 'reels', 'direct', 'accounts', 'stories'].includes(match[1])) {
      console.log('Found username from header link:', match[1]);
      return match[1];
    }
  }

  // Method 5: Try to get from title
  const title = document.title;
  const titleMatch = title.match(/@(\w+)/);
  if (titleMatch) {
    console.log('Found username from title:', titleMatch[1]);
    return titleMatch[1];
  }

  console.log('Could not find username');
  return null;
}

async function fetchUserList(username, type) {
  const users = [];
  let hasNext = true;
  let endCursor = null;
  let retryCount = 0;
  const maxRetries = 3;
  
  // First, we need to get the user ID
  updateProgress(analysisState.progress, `Getting user info for @${username}...`);
  const userId = await getUserId(username);
  
  if (!userId) {
    throw new Error(`Could not find user ID for @${username}. Make sure you're on the correct profile.`);
  }
  
  console.log(`✅ Found user ID: ${userId} for @${username}`);

  while (hasNext) {
    try {
      // Use Instagram's web API
      const count = 50;
      let url;
      
      if (type === 'followers') {
        url = `https://www.instagram.com/api/v1/friendships/${userId}/followers/?count=${count}&search_surface=follow_list_page`;
      } else {
        url = `https://www.instagram.com/api/v1/friendships/${userId}/following/?count=${count}`;
      }
      
      if (endCursor) {
        url += `&max_id=${endCursor}`;
      }
      
      console.log(`📡 Fetching ${type}:`, url);

      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': getCsrfToken(),
          'X-ASBD-ID': '129477',
          'X-IG-WWW-Claim': sessionStorage.getItem('www-claim-v2') || '0'
        }
      });

      console.log(`📬 Response status for ${type}:`, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error response for ${type}:`, errorText);
        
        if (response.status === 429) {
          if (retryCount < maxRetries) {
            retryCount++;
            updateProgress(analysisState.progress, `Rate limited, waiting... (retry ${retryCount}/${maxRetries})`);
            await sleep(5000 * retryCount);
            continue;
          }
          throw new Error('Rate limited by Instagram. Please wait a few minutes and try again.');
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Not authorized to view ${type}. Make sure you're logged in and viewing your own profile.`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📦 Got ${type} data:`, { 
        userCount: data.users?.length || 0, 
        hasNextPage: !!data.next_max_id,
        status: data.status 
      });
      
      const userList = data.users || [];
      
      if (userList.length === 0 && users.length === 0 && !endCursor) {
        console.warn(`⚠️ No ${type} returned on first request`);
      }
      
      for (const user of userList) {
        users.push({
          username: user.username,
          fullName: user.full_name,
          profilePic: user.profile_pic_url,
          isVerified: user.is_verified,
          userId: user.pk || user.id
        });
      }

      hasNext = !!data.next_max_id;
      endCursor = data.next_max_id;
      retryCount = 0;

      // Update progress
      const baseProgress = type === 'followers' ? 10 : 55;
      const progressRange = 45;
      const currentProgress = baseProgress + Math.min(progressRange - 5, (users.length / 100) * progressRange);
      
      updateProgress(
        currentProgress,
        `Fetching ${type}: ${users.length} found...`
      );

      // Add delay to avoid rate limiting
      if (hasNext) {
        await sleep(1000 + Math.random() * 500);
      }
      
    } catch (error) {
      console.error(`❌ Error fetching ${type}:`, error);
      
      if (retryCount < maxRetries && !error.message.includes('Rate limited') && !error.message.includes('Not authorized')) {
        retryCount++;
        console.log(`🔄 Retrying ${type}... (${retryCount}/${maxRetries})`);
        await sleep(2000);
        continue;
      }
      
      // If we have some users, continue with what we have
      if (users.length > 0) {
        console.warn(`⚠️ Continuing with ${users.length} ${type} collected`);
        break;
      }
      
      throw error;
    }
  }

  console.log(`✅ Total ${type} fetched:`, users.length);
  return users;
}

function getCsrfToken() {
  const cookie = document.cookie.split('; ').find(row => row.startsWith('csrftoken='));
  return cookie ? cookie.split('=')[1] : '';
}

async function getUserId(username) {
  try {
    console.log(`Getting user ID for @${username}...`);
    
    // Method 1: Use the web profile info API
    const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
      credentials: 'include',
      headers: {
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': getCsrfToken()
      }
    });

    if (response.ok) {
      const data = await response.json();
      const userId = data?.data?.user?.id;
      if (userId) {
        console.log(`Got user ID from web_profile_info: ${userId}`);
        return userId;
      }
    }
    
  } catch (error) {
    console.error('Error getting user ID (method 1):', error);
  }
  
  try {
    // Method 2: Parse from the page's shared data
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        // Look for user ID in various possible locations
        const userId = findUserIdInObject(data, username);
        if (userId) {
          console.log(`Got user ID from page data: ${userId}`);
          return userId;
        }
      } catch (e) {}
    }
  } catch (error) {
    console.error('Error getting user ID (method 2):', error);
  }
  
  try {
    // Method 3: Fetch profile page and parse
    const response = await fetch(`https://www.instagram.com/${username}/`, {
      credentials: 'include'
    });
    const html = await response.text();
    
    // Look for user ID in the HTML
    const userIdMatch = html.match(/"user_id":"(\d+)"/);
    if (userIdMatch) {
      console.log(`Got user ID from HTML: ${userIdMatch[1]}`);
      return userIdMatch[1];
    }
    
    const profileIdMatch = html.match(/"profilePage_(\d+)"/);
    if (profileIdMatch) {
      console.log(`Got user ID from profilePage: ${profileIdMatch[1]}`);
      return profileIdMatch[1];
    }
  } catch (error) {
    console.error('Error getting user ID (method 3):', error);
  }
    
  return null;
}

function findUserIdInObject(obj, username) {
  if (!obj || typeof obj !== 'object') return null;
  
  if (obj.username === username && (obj.id || obj.pk)) {
    return obj.id || obj.pk;
  }
  
  for (const key of Object.keys(obj)) {
    const result = findUserIdInObject(obj[key], username);
    if (result) return result;
  }
  
  return null;
}

function updateProgress(progress, message) {
  analysisState.progress = progress;
  analysisState.message = message;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convert image URL to base64 data URL (to bypass CORS in popup)
async function imageToBase64(url) {
  try {
    if (!url || url.startsWith('data:')) return url;
    
    // Use a canvas to convert the image
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } catch (e) {
          console.warn('Canvas conversion failed:', e);
          resolve(null);
        }
      };
      
      img.onerror = () => {
        console.warn('Image load failed:', url?.substring(0, 50));
        resolve(null);
      };
      
      // Timeout after 3 seconds
      setTimeout(() => resolve(null), 3000);
      
      img.src = url;
    });
  } catch (e) {
    console.warn('Failed to convert image:', e);
    return null;
  }
}

// Convert profile pics to base64 for a batch of users
async function convertProfilePics(users, batchSize = 5) {
  const results = [...users];
  let converted = 0;
  
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    const promises = batch.map(async (user, idx) => {
      if (user.profilePic && !user.profilePic.startsWith('data:')) {
        const base64 = await imageToBase64(user.profilePic);
        if (base64) {
          results[i + idx].profilePic = base64;
          converted++;
        }
      }
    });
    await Promise.all(promises);
    
    // Update progress
    updateProgress(95 + (i / results.length) * 4, `Converting images... ${converted}/${results.length}`);
    
    // Small delay between batches
    if (i + batchSize < results.length) {
      await sleep(50);
    }
  }
  
  console.log(`🖼️ Converted ${converted}/${results.length} profile pictures`);
  return results;
}

// Add visual indicator when extension is active
function showActiveIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'ig-checker-indicator';
  indicator.innerHTML = '📊 IG Checker Active';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 10px 15px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: bold;
    z-index: 9999;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(indicator);
  
  setTimeout(() => {
    indicator.style.opacity = '1';
  }, 100);
  
  setTimeout(() => {
    indicator.style.opacity = '0';
    setTimeout(() => indicator.remove(), 300);
  }, 3000);
}

// Show indicator when page loads
if (document.readyState === 'complete') {
  showActiveIndicator();
} else {
  window.addEventListener('load', showActiveIndicator);
}
