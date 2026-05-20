# macOS Developer ID 证书准备步骤

这份文档只解决一件事：

在你的 Apple Developer 账号已经付费并审核通过之后，如何在本机创建并安装 `Developer ID Application` 证书，为 `CodePal.app` 的签名做准备。

它不包含最终 notarization 和发布收尾，只覆盖“先把本机签名证书准备好”这一步。

---

## 1. 你现在要创建哪个证书

你要选的是：

- `Developer ID Application`

用途：

- 给 `CodePal.app` 签名
- 用于 `dmg` / `zip` 这种 Mac App Store 外部分发

现在不要选这些：

- `Apple Development`
- `Mac Development`
- `Apple Distribution`
- `Mac App Distribution`
- `Developer ID Installer`

说明：

- `Developer ID Installer` 是给 `.pkg` 安装包签名的
- 你现在发的是 `.app` + `.dmg/.zip`
- 所以当前只需要 `Developer ID Application`

---

## 2. 在本机生成 CSR 文件

这一步必须在你之后要用于打包签名的这台 Mac 上完成。

### 2.1 打开“钥匙串访问”

中文系统里，这个应用的名字是：

- `钥匙串访问`

打开方式任选一种：

#### 方法 A：Spotlight

按 `Command + 空格`，输入：

- `钥匙串访问`

#### 方法 B：Finder

打开：

- `应用程序`
- `实用工具`
- `钥匙串访问`

#### 方法 C：终端

```bash
open -a "Keychain Access"
```

### 2.2 创建 CSR

打开“钥匙串访问”后，在顶部菜单栏点击：

- `钥匙串访问`
- `证书助理`
- `从证书颁发机构请求证书...`

会弹出一个窗口。

### 2.3 填写内容

填写时建议这样填：

- `用户电子邮件地址`
  - 填你的邮箱
- `常用名称`
  - 建议填：`CodePal Developer ID`
- `CA 电子邮件地址`
  - 留空

然后勾选：

- `存储到磁盘`

再点击：

- `继续`

选择一个保存位置，比如桌面。

保存后你会得到一个文件：

- `*.certSigningRequest`

这就是 CSR 文件。

### 2.4 这一步为什么重要

这一步除了生成 CSR 文件，还会在你本机钥匙串里生成一把私钥。

后面 Apple 返回给你的证书，必须和这把私钥配对。

所以：

- 最好就在最终要打包签名的那台 Mac 上做
- 不要在 A 机器生成 CSR，拿去 B 机器装证书后又想在 C 机器签名

---

## 3. 去 Apple Developer 后台创建证书

打开：

- [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)

登录后按下面步骤操作：

1. 进入 `Certificates, Identifiers & Profiles`
2. 左侧点击 `Certificates`
3. 右上角点击 `+`
4. 在证书类型里找到并选择：
   - `Developer ID Application`
5. 点击继续
6. 上传你刚才生成的：
   - `*.certSigningRequest`
7. 点击生成
8. 下载生成好的证书文件：
   - `*.cer`

如果你看到的页面就是证书类型列表，那么这一步只需要选：

- `Developer ID Application`

不要选：

- `Developer ID Installer`

---

## 4. 把证书安装到本机

下载完 `*.cer` 之后：

1. 直接双击这个文件
2. 系统会自动导入到“钥匙串访问”

然后打开“钥匙串访问”，检查：

- 左侧选 `登录`
- 类别里看 `我的证书`

你应该能看到类似：

- `Developer ID Application: 你的名字或组织名 (TEAMID)`

重点不是只看到证书，而是：

- 这条证书下面应该还能展开看到对应私钥

如果只有证书、没有私钥，通常说明：

- CSR 不是在当前机器生成的
- 或当前证书和本机私钥没有正确配对

---

## 5. 在终端验证证书是否可用

打开终端，执行：

```bash
security find-identity -v -p codesigning
```

你期待看到类似输出：

```text
Developer ID Application: Your Name Or Org (TEAMID)
```

只要输出里明确有：

- `Developer ID Application`

就说明这一步基本通了。

如果没有，先不要继续后面的签名打包。

---

## 6. 顺手记下后面会用到的三个信息

后面 notarization 会用到这些：

- `Apple ID`
- `Team ID`
- `App 专用密码`

其中：

- `Team ID` 可以在 Apple Developer 团队信息里找到
- `App 专用密码` 需要去 Apple ID 账号页面生成

现在先不用急着配命令，但最好先确认自己都拿得到。

---

## 7. CodePal 仓库当前已经准备好的东西

仓库里已经有签名骨架，不需要你从零补：

- [electron-builder.yml](/Users/renjinming/code/my_porjects/shamcleren/CodePal/electron-builder.yml)
- [build/entitlements.mac.plist](/Users/renjinming/code/my_porjects/shamcleren/CodePal/build/entitlements.mac.plist)
- [build/entitlements.mac.inherit.plist](/Users/renjinming/code/my_porjects/shamcleren/CodePal/build/entitlements.mac.inherit.plist)

也就是说，你现在最关键的不是改仓库配置，而是先把本机证书准备好。

---

## 8. 证书准备好以后，下一步是什么

当下面这条命令已经能看到 `Developer ID Application`：

```bash
security find-identity -v -p codesigning
```

下一步才进入 CodePal 的签名流程：

### 8.1 本地打包

```bash
npm run dist:mac
```

### 8.2 检查签名结果

```bash
codesign --display --verbose=4 "release/mac/CodePal.app"
```

如果这里显示还是 ad-hoc，说明证书还没被正确用于签名。

### 8.3 后续 notarization

再往后才是：

- `notarytool store-credentials`
- `notarytool submit`
- `stapler staple`
- `spctl / codesign --verify`

这些属于下一阶段，不在这份文档里展开。

---

## 9. 你现在最该完成的最小目标

你现在只需要做到这一条：

```bash
security find-identity -v -p codesigning
```

输出里能看到：

- `Developer ID Application: ...`

只要看到这个，就说明“创建本机签名证书”这一步已经完成了。

---

## 10. 完成后怎么继续

当你完成这一步后，把下面命令的输出发出来：

```bash
security find-identity -v -p codesigning
```

我就可以继续带你做下一步：

- `CodePal` 本地签名打包
- notarization
- staple
- 最终验证
