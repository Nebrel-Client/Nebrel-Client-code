use crate::error::Result;
use crate::utils::http_client::nrc_get;
use log::{debug, info};
use serde::{Deserialize, Serialize};

pub struct WordPressApi;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OgImage {
    pub url: Option<String>,
    #[serde(rename = "type")]
    pub image_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct YoastHeadJson {
    pub title: Option<String>,
    pub description: Option<String>,
    pub og_description: Option<String>,
    pub og_url: Option<String>,
    pub og_image: Option<Vec<OgImage>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BlogPost {
    pub id: i64,
    pub date: String,
    /// Which sections a post belongs to: 21 = news, 2 = changelog.
    #[serde(default)]
    pub categories: Vec<i64>,
    pub yoast_head_json: Option<YoastHeadJson>,
}

/// The whole feed as published at `news.json`.
#[derive(Serialize, Deserialize, Debug, Clone)]
struct NewsFeed {
    #[serde(default)]
    posts: Vec<BlogPost>,
}

impl WordPressApi {
    pub fn new() -> Self {
        Self
    }

    /// The news feed. A single static file rather than the old WordPress API,
    /// so publishing news means uploading one JSON file.
    pub fn get_api_base() -> String {
        String::from("https://nebrelblog.netlify.app/news.json")
    }

    /// Fetch blog posts from WordPress API
    ///
    /// # Arguments
    ///
    /// * `categories` - Optional comma-separated list of category IDs to filter by
    /// * `per_page` - Optional number of posts to return per page
    /// * `page` - Optional page number
    ///
    /// # Returns
    ///
    /// * `Result<Vec<BlogPost>>` - A vector of blog posts or an error
    pub async fn get_blog_posts(
        categories: Option<&str>,
        per_page: Option<u32>,
        page: Option<u32>,
    ) -> Result<Vec<BlogPost>> {
        let url = Self::get_api_base();

        info!("[News] Fetching the news feed");
        debug!("[News] Full URL: {}", url);

        let feed = nrc_get(url).json::<NewsFeed>("Nebrel news feed").await?;
        let mut posts = feed.posts;

        // The feed is one static file, so filtering and paging happen here
        // rather than being pushed onto a query string.
        if let Some(cats) = categories {
            let wanted: Vec<i64> = cats
                .split(',')
                .filter_map(|id| id.trim().parse::<i64>().ok())
                .collect();

            if !wanted.is_empty() {
                debug!("[News] Keeping categories {:?}", wanted);
                posts.retain(|post| post.categories.iter().any(|id| wanted.contains(id)));
            }
        }

        // Newest first.
        posts.sort_by(|a, b| b.date.cmp(&a.date));

        let size = per_page.unwrap_or(10).clamp(1, 50) as usize;
        let skip = page.unwrap_or(1).max(1).saturating_sub(1) as usize * size;

        debug!("[News] {} post(s) after filtering, page size {}", posts.len(), size);
        Ok(posts.into_iter().skip(skip).take(size).collect())
    }

    /// Fetches news posts (category 21) and changelog posts (category 2)
    ///
    /// # Returns
    ///
    /// * `Result<Vec<BlogPost>>` - A vector of blog posts or an error
    pub async fn get_news_and_changelogs() -> Result<Vec<BlogPost>> {
        info!("[WordPress API] Fetching news and changelog posts");
        Self::get_blog_posts(Some("21,2"), Some(10), Some(1)).await
    }

    /// Fetches only news posts (category 21)
    ///
    /// # Returns
    ///
    /// * `Result<Vec<BlogPost>>` - A vector of blog posts or an error
    pub async fn get_news() -> Result<Vec<BlogPost>> {
        info!("[WordPress API] Fetching news posts");
        Self::get_blog_posts(Some("21"), Some(10), Some(1)).await
    }

    /// Fetches only changelog posts (category 2)
    ///
    /// # Returns
    ///
    /// * `Result<Vec<BlogPost>>` - A vector of blog posts or an error
    pub async fn get_changelogs() -> Result<Vec<BlogPost>> {
        info!("[WordPress API] Fetching changelog posts");
        Self::get_blog_posts(Some("2"), Some(10), Some(1)).await
    }
}
