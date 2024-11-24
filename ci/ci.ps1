function global:Get-Next-Version-Tag {
    $currentBranch = $env:CI_COMMIT_BRANCH
    $rcPrefix = 'rc-' + $env:VERSION_PREFIX
    $releaseBranchPrefix = $env:RELEASE_BRANCH_PREFIX

    $releaseNumber = "0"
    $version = $null

    if ($currentBranch -like $releaseBranchPrefix + '*') {
        $releaseNumber = $currentBranch.Substring($releaseBranchPrefix.Length)
    } elseif ($currentBranch -eq 'develop') {
        git fetch --no-tags

        $releaseBranch = (git branch -r --list *$releaseBranchPrefix*) | Sort-Object -Descending | Select-Object -First 1
        if ($releaseBranch) {
            Write-Debug "Found last release branch: $releaseBranch"

            [int] $number = $releaseBranch.Trim().SubString($releaseBranchPrefix.Length + 7)
            $releaseNumber = $number + 1
        } else {
            Write-Debug "There's no release branches"
        }
    } else {
        throw "In branch " + $currentBranch + " is unavailable to build release candidate"
    }

    Write-Debug "Current release: $releaseNumber"
    $rcTag = (git for-each-ref --sort='-refname' --sort='-creatordate' --count=1 --format='%(refname:lstrip=2)' *refs/tags/$rcPrefix$releaseNumber.* --merged)
    if (!$rcTag) {
        Write-Debug "Starting first build of $releaseNumber release"
        $rcTag = $rcPrefix + $releaseNumber + '.0'                
    } else {
        Write-Debug "Found last tag $rcTag"
    }
    
    $version = Get-Tag-From-String($rcTag)

    $version.incBuildNumber()
    return $version.getTag()        
}

function global:Get-Tag-From-String {
    param(
        [string] $Tag
    )
    
    $array = $tag -split {$_ -eq "-" -or $_ -eq "."}
    
    $result = [Tag]::new()
    $result.Prefix = $array[0]
    $result.Major = $array[1]
    $result.Minor = $array[2]
    $result.Version = $array[3]    
    $result.Build = $array[4]
    return $result
}

class Tag 
{
    [string] $Prefix
    [int] $Major
    [int] $Minor
    [int] $Version
    [int] $Build
     
    incBuildNumber() 
    {
        $this.Build++
    }

    incVersionNumber()
    {
        $this.Version++
        $this.Build = 1
    }

    [string] getTag()
    {
        return "{0}-{1}" -f $this.Prefix, $this.getFileVersion();
    }
        
    [string] getFileVersion()
    {
        return "{0}.{1}.{2}.{3}" -f $this.Major, $this.Minor, $this.Version, $this.Build;
    }

    [int] getOrder()
    {
        return 10000000 * $this.Major + 100000 * $this.Minor + 100 * $this.Version + $this.Build;
    }
}

function global:Push-New-Tag {
    [CmdletBinding(SupportsShouldProcess=$true)]
    param(
        [Parameter(Mandatory=$true)]
        [string] $Tag)
    process {
        Write-Host "git tag $Tag"
        git tag $Tag
        if (!$?) {
            throw 'Error on git tag'
        }

        $GitUrl = 'https://' + $env:GITLAB_USERNAME + ':' + $env:GITLAB_TOKEN + '@' + $env:CI_SERVER_HOST + '/' + $env:CI_PROJECT_PATH + '.git'
        git push $GitUrl -o ci.skip --tags
        if (!$?) {
            throw 'Error on git push'
        }
    }
}

function global:Copy-if-not-exists {
    param (
        [string] $SourceFolder,
        [string] $DestinationFolder
    )

    if (Get-Item -Path $DestinationFolder\ -ErrorAction Ignore)
    {
        throw "Folder " + $DestinationFolder + " exists. Conflict detected"
    }

    New-Item $DestinationFolder -ItemType Directory
    Copy-Item -Path "$SourceFolder\*" -Destination "$DestinationFolder\" -Verbose -Recurse 
}