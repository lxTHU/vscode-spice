# SPICE support for VSCode

> SPICE syntax highlighting refenence [leoheck/sublime-spice](https://github.com/leoheck/sublime-spice) TextMate rules.
>
> Other useful rules reference see: [1995parham/vim-spice](https://github.com/1995parham/vim-spice)

## GitHub repos
[lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice)

## See also
[Seeing SPICE in VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=xuanli.spice)

# Features
## Done
- Syntax highlighting of 
    - Comments `*|;|&`
    - Circuits Elements `R|...` `V|...` `X|...` 
    - Expressions `abs()|...` `""` 
    - SPICE Commands `.subckt|...` `.tran|...` 

## In progress
- [ ] Determine name--string of `./syntaxes/SPICE.tmlanguage` for mostly used Themes. *(reference Themes' .json file's `scope`&`colors`)* 
- [ ] Add support for **non**-`Monokai` color themes.
    - [x] support for `Dark+ (default dark)`

## In the future
- [ ] Add snippets support


## Contributing
1. Fork it ( [https://github.com/lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice) )
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request

