#![allow(
    async_fn_in_trait,
    dead_code,
    deprecated,
    irrefutable_let_patterns,
    non_snake_case,
    private_interfaces,
    unreachable_patterns,
    unused_assignments,
    unused_imports,
    unused_variables,
    unused_mut
)]

pub mod branding;
#[macro_use]
pub mod utils;
pub mod commands;
pub mod config;
pub mod error;
pub mod friends;
pub mod integrations;
pub mod minecraft;
pub mod state;
